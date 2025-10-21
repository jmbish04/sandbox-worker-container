import type { AgentMessage, AgentResponse, AgentState } from '../types/agent-types';
import { BaseAgentDO } from './base-agent-do';
import { AgentFactory } from '../core/agent-factory';

interface ConversationState extends AgentState {
  activeAgents: Array<string>;
}

export class ConversationManagerDO extends BaseAgentDO {
  private readonly factory = new AgentFactory(this.env);

  async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    switch (message.type) {
      case 'start_conversation':
        return this.startConversation(message);
      case 'route_message':
        return this.routeMessage(message);
      default:
        return {
          type: 'conversation_error',
          content: { error: `Unsupported conversation message: ${message.type}` },
        };
    }
  }

  async getState(): Promise<ConversationState> {
    return (
      (await this.storage.get<ConversationState>('state')) ?? {
        agentId: crypto.randomUUID(),
        sessionId: 'conversation',
        conversationHistory: [],
        extractedSlots: {},
        preferences: {},
        metadata: { agentType: 'conversation' },
        activeAgents: [],
      }
    );
  }

  async updateState(updates: Partial<ConversationState>): Promise<void> {
    const current = await this.getState();
    const merged: ConversationState = { ...current, ...updates, lastUpdated: Date.now() };
    await this.storage.put('state', merged);
  }

  private async startConversation(message: AgentMessage): Promise<AgentResponse> {
    const conversationId = (message.context?.conversationId ?? crypto.randomUUID()) as string;
    const travelAgent = await this.factory.createTravelAgent(conversationId);

    const state = await this.getState();
    state.metadata = {
      agentType: state.metadata?.agentType ?? 'conversation',
      ...state.metadata,
      conversationId,
    };
    state.activeAgents = Array.from(new Set([...state.activeAgents, `TRAVEL_AGENT:travel:${conversationId}`]));
    await this.storage.put('state', state);

    return {
      type: 'conversation_started',
      content: {
        conversationId,
        travelAgent: travelAgent,
      },
    };
  }

  private async routeMessage(message: AgentMessage): Promise<AgentResponse> {
    const conversationId = (message.context?.conversationId ?? 'default') as string;
    const travelAgent = await this.factory.createTravelAgent(conversationId);
    const response = await travelAgent.fetch('https://agent/message', {
      method: 'POST',
      body: JSON.stringify({
        type: 'chat',
        content: message.content,
        context: message.context,
      }),
      headers: { 'content-type': 'application/json' },
    });

    return {
      type: 'conversation_routed',
      content: await response.json(),
    };
  }
}
