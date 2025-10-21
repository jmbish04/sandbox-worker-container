import type { DurableObject, Request, Response as CfResponse } from '@cloudflare/workers-types';
import type { AgentMessage, AgentResponse, AgentState } from '../types/agent-types';
import type { DurableObjectState, DurableObjectStorage, Env } from '../types';

export abstract class BaseAgentDO implements DurableObject {
  protected readonly storage: DurableObjectStorage;

  constructor(protected readonly state: DurableObjectState, protected readonly env: Env) {
    this.storage = state.storage;
  }

  abstract handleMessage(message: AgentMessage): Promise<AgentResponse>;
  abstract getState(): Promise<AgentState>;
  abstract updateState(updates: Partial<AgentState>): Promise<void>;

  async onStart(): Promise<void> {
    const existing = await this.storage.get<AgentState>('state');
    if (!existing) {
      await this.initializeState();
    }
  }

  async onStop(): Promise<void> {
    await this.persistState();
  }

  protected async initializeState(): Promise<void> {
    const defaultState: AgentState = {
      agentId: crypto.randomUUID(),
      sessionId: 'default',
      conversationHistory: [],
      extractedSlots: {},
      preferences: {},
      metadata: { agentType: 'meta' },
    };

    await this.storage.put('state', defaultState);
  }

  protected async persistState(): Promise<void> {
    const state = await this.storage.get<AgentState>('state');
    if (state) {
      state.lastUpdated = Date.now();
      await this.storage.put('state', state);
    }
  }

  async fetch(request: Request): Promise<CfResponse> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/message':
        if (request.method === 'POST') {
          const body = (await request.json()) as AgentMessage;
          const response = await this.handleMessage(body);
          return new Response(JSON.stringify(response), {
            headers: { 'content-type': 'application/json' },
          }) as CfResponse;
        }
        break;
      case '/state':
        if (request.method === 'GET') {
          const state = await this.getState();
          return new Response(JSON.stringify(state), {
            headers: { 'content-type': 'application/json' },
          }) as CfResponse;
        }
        break;
      case '/health':
        return new Response(JSON.stringify({ status: 'healthy' }), {
          headers: { 'content-type': 'application/json' },
        }) as CfResponse;
      default:
        break;
    }

    return new Response('Not Found', { status: 404 }) as CfResponse;
  }
}
