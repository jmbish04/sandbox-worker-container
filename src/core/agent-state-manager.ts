import type { DurableObjectStorage } from '../types';
import type { AgentState, ConversationTurn } from '../types/agent-types';

export class AgentStateManager {
  private static readonly STATE_KEY = 'agent_state';
  private static readonly UPDATED_AT_KEY = 'last_updated';

  constructor(private readonly storage: DurableObjectStorage) {}

  async saveState(state: AgentState): Promise<void> {
    const enriched: AgentState = { ...state, lastUpdated: Date.now() };
    await this.storage.put(AgentStateManager.STATE_KEY, enriched);
    await this.storage.put(AgentStateManager.UPDATED_AT_KEY, enriched.lastUpdated);
  }

  async getState(): Promise<AgentState | null> {
    const state = await this.storage.get<AgentState>(AgentStateManager.STATE_KEY);
    return state ?? null;
  }

  async appendConversationTurn(turn: ConversationTurn): Promise<void> {
    const state = (await this.getState()) ?? this.getDefaultState();
    state.conversationHistory = [...state.conversationHistory, turn];
    await this.saveState(state);
  }

  async updateSlots(slots: Record<string, unknown>): Promise<void> {
    const state = (await this.getState()) ?? this.getDefaultState();
    state.extractedSlots = { ...state.extractedSlots, ...slots };
    await this.saveState(state);
  }

  private getDefaultState(): AgentState {
    return {
      agentId: crypto.randomUUID(),
      sessionId: 'default',
      conversationHistory: [],
      extractedSlots: {},
      preferences: {},
      metadata: { agentType: 'meta' },
    };
  }
}
