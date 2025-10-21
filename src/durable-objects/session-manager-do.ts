import type { AgentMessage, AgentResponse, AgentState } from '../types/agent-types';
import { BaseAgentDO } from './base-agent-do';

interface SessionState extends AgentState {
  sessions: Record<string, unknown>;
}

export class SessionManagerDO extends BaseAgentDO {
  async handleMessage(message: AgentMessage): Promise<AgentResponse> {
    switch (message.type) {
      case 'session_update':
        await this.updateState(message.content as Partial<SessionState>);
        return { type: 'session_updated', content: message.content };
      case 'session_get':
        return { type: 'session_state', content: await this.getState() };
      default:
        return { type: 'session_unknown', content: { error: `Unknown session message ${message.type}` } };
    }
  }

  async getState(): Promise<SessionState> {
    return (
      (await this.storage.get<SessionState>('state')) ?? {
        agentId: crypto.randomUUID(),
        sessionId: 'session-manager',
        conversationHistory: [],
        extractedSlots: {},
        preferences: {},
        metadata: { agentType: 'session-manager' },
        sessions: {},
      }
    );
  }

  async updateState(updates: Partial<SessionState>): Promise<void> {
    const current = await this.getState();
    const merged: SessionState = { ...current, ...updates, lastUpdated: Date.now() };
    await this.storage.put('state', merged);
  }
}
