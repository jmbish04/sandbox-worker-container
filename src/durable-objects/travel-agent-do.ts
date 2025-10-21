import type { AgentMessage, AgentResponse, TravelIntent } from '../types/agent-types';
import { BaseAgentDO } from './base-agent-do';
import { MetaOrchestratorAgent } from '../agents/meta-orchestrator';
import type { AgentState } from '../types/agent-types';
import { AgentStateManager } from '../core/agent-state-manager';
import type { TravelAgentContext } from '../agents/base-agent';

export class TravelAgentDO extends BaseAgentDO {
  private readonly stateManager = new AgentStateManager(this.storage);
  private readonly orchestrator = new MetaOrchestratorAgent(
    this.state as unknown as TravelAgentContext,
    this.env,
  );

  async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    switch (message.type) {
      case 'chat':
        return this.handleChatMessage(message);
      case 'state_query':
        return {
          type: 'state_response',
          content: await this.getState(),
        };
      default:
        return {
          type: 'unsupported',
          content: { error: `Unsupported message type: ${message.type}` },
        };
    }
  }

  async getState(): Promise<AgentState> {
    return (await this.stateManager.getState()) ?? {
      agentId: crypto.randomUUID(),
      sessionId: 'default',
      conversationHistory: [],
      extractedSlots: {},
      preferences: {},
      metadata: { agentType: 'meta' },
    };
  }

  async updateState(updates: Partial<AgentState>): Promise<void> {
    const current = await this.getState();
    const merged: AgentState = { ...current, ...updates, lastUpdated: Date.now() };
    await this.stateManager.saveState(merged);
  }

  private async handleChatMessage(message: AgentMessage): Promise<AgentResponse> {
    const intent = await this.extractIntent(message.content);
    const response = await this.orchestrator.handleIntent(intent, message.context);

    const turn = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      userMessage: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      agentResponse: response,
      intent,
      confidence: response.confidence,
    };

    await this.stateManager.appendConversationTurn(turn);
    return response;
  }

  private async extractIntent(content: unknown): Promise<TravelIntent> {
    if (typeof content === 'object' && content && 'intent' in content) {
      return (content as { intent: TravelIntent }).intent;
    }

    const text = typeof content === 'string' ? content : JSON.stringify(content);

    return {
      id: crypto.randomUUID(),
      type: 'destination',
      originalQuery: text,
      query: text,
    } as TravelIntent;
  }
}
