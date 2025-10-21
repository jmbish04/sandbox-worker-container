import { Agent, type AgentContext as AgentsContext } from '@cloudflare/agents';
import type { Env } from '../types';
import { AgentToolRegistry } from '../tools/agent-tool-registry';
import type {
  AgentExecutionContext,
  AgentResponse,
  AgentState,
  TravelIntent,
  ValidationResult,
} from '../types/agent-types';

export type TravelAgentContext = AgentsContext;
export type TravelAgentEnv = Env;

export abstract class TravelAgent<State extends AgentState = AgentState> extends Agent<Env, State> {
  protected readonly storage;
  protected readonly toolRegistry = new AgentToolRegistry();

  constructor(ctx: AgentsContext, env: Env) {
    super(ctx, env);
    this.storage = ctx.storage;
  }

  abstract handleIntent(intent: TravelIntent, context?: AgentExecutionContext): Promise<AgentResponse>;

  abstract validateResponse(response: AgentResponse): Promise<ValidationResult>;

  protected async persistState(state: State): Promise<void> {
    await this.storage.put('state', state);
    this.setState(state);
  }

  protected async getState(): Promise<State | null> {
    const state = (await this.storage.get<State>('state')) ?? null;
    if (state) {
      this.setState(state);
    }
    return state;
  }
}
