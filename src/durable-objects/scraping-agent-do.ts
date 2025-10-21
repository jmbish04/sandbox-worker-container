import type { AgentMessage, AgentResponse, AgentState } from '../types/agent-types';
import { BaseAgentDO } from './base-agent-do';

export class ScrapingAgentDO extends BaseAgentDO {
  async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    return {
      type: 'scraping_ack',
      content: {
        received: message,
        status: 'queued',
      },
    };
  }

  async getState(): Promise<AgentState> {
    return (
      (await this.storage.get<AgentState>('state')) ?? {
        agentId: crypto.randomUUID(),
        sessionId: 'scraping',
        conversationHistory: [],
        extractedSlots: {},
        preferences: {},
        metadata: { agentType: 'scraping' },
      }
    );
  }

  async updateState(updates: Partial<AgentState>): Promise<void> {
    const current = await this.getState();
    const merged: AgentState = { ...current, ...updates, lastUpdated: Date.now() };
    await this.storage.put('state', merged);
  }
}
