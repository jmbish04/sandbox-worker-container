import { Agent, type AgentContext } from '@cloudflare/agents';
import { nanoid } from 'nanoid';
import type { Env } from '../types';
import {
  type ExecutionHistoryEntry,
  type ExecutionParams,
  type ExecutionResult,
  type SandboxContainerMetrics,
  type SandboxState,
} from './state';

const DEFAULT_RESOURCE_LIMITS = {
  cpu: 1,
  memory: 512,
  storage: 2048,
};

const INITIAL_STATE: SandboxState = {
  initialized: false,
  activeContainers: {},
  executionHistory: [],
  resourceUsage: { ...DEFAULT_RESOURCE_LIMITS },
  securityContext: {
    isolated: true,
    permissions: [],
  },
};

export class Sandbox extends Agent<Env, SandboxState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    if (!this.state) {
      this.setState({ ...INITIAL_STATE });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/execute') {
      const params = await request.json<ExecutionParams>();
      const result = await this.executeCode(params);
      return Response.json(result);
    }

    if (url.pathname === '/state') {
      return Response.json(this.ensureState());
    }

    if (url.pathname === '/validate') {
      const validation = await this.validateEnvironment();
      return Response.json({ valid: validation });
    }

    return new Response('Not found', { status: 404 });
  }

  private ensureState(): SandboxState {
    const state = this.state;
    if (state) {
      return state;
    }

    this.setState({ ...INITIAL_STATE, initialized: true });
    return this.ensureState();
  }

  async onStart() {
    const state = this.ensureState();
    if (!state.initialized) {
      await this.validateEnvironment();
      this.setState({ ...state, initialized: true });
    }
  }

  async executeCode(params: ExecutionParams): Promise<ExecutionResult> {
    const state = this.ensureState();
    const containerId = await this.createContainer(params.runtime);

    try {
      const result = await this.runInContainer(containerId, params, {
        timeout: params.timeout ?? 30_000,
        memoryLimit: params.memoryLimit ?? '512MB',
        cpuLimit: params.cpuLimit ?? '1',
      });

      const metrics = await this.getContainerMetrics(containerId);
      const historyEntry: ExecutionHistoryEntry = {
        id: containerId,
        timestamp: Date.now(),
        result,
        resources: metrics,
      };

      this.setState({
        ...state,
        executionHistory: [...state.executionHistory, historyEntry],
        activeContainers: {
          ...state.activeContainers,
          [containerId]: metrics,
        },
      });

      return result;
    } finally {
      await this.cleanupContainer(containerId);
    }
  }

  private async createContainer(runtime: string): Promise<string> {
    const state = this.ensureState();
    const containerId = nanoid(12);
    const metrics: SandboxContainerMetrics = {
      runtime,
      cpu: DEFAULT_RESOURCE_LIMITS.cpu,
      memory: DEFAULT_RESOURCE_LIMITS.memory,
      storage: DEFAULT_RESOURCE_LIMITS.storage,
      createdAt: Date.now(),
    };

    this.setState({
      ...state,
      activeContainers: {
        ...state.activeContainers,
        [containerId]: metrics,
      },
    });

    return containerId;
  }

  private async runInContainer(
    containerId: string,
    params: ExecutionParams,
    limits: { timeout: number; memoryLimit: string; cpuLimit: string },
  ): Promise<ExecutionResult> {
    const simulatedLatency = Math.min(Math.max(params.code.length, 10), 1000);
    await new Promise((resolve) => setTimeout(resolve, simulatedLatency));

    const diagnostics = {
      timeout: limits.timeout,
      memoryLimit: limits.memoryLimit,
      cpuLimit: limits.cpuLimit,
      environment: params.environment ?? {},
    } satisfies Record<string, unknown>;

    const hasError = params.code.includes('throw new Error') || params.code.includes('RuntimeError');

    if (hasError) {
      return {
        output: '',
        error: 'Simulated execution error',
        stackTrace: 'Error: Simulated execution error\n    at sandbox:1:1',
        diagnostics,
      };
    }

    return {
      output: `Executed in container ${containerId} using ${params.runtime}`,
      diagnostics,
    };
  }

  private async cleanupContainer(containerId: string): Promise<void> {
    const state = this.ensureState();
    if (!state.activeContainers[containerId]) {
      return;
    }

    const { [containerId]: _removed, ...remaining } = state.activeContainers;
    this.setState({
      ...state,
      activeContainers: remaining,
    });
  }

  private async getContainerMetrics(containerId: string): Promise<SandboxContainerMetrics> {
    const state = this.ensureState();
    const existing = state.activeContainers[containerId];
    if (existing) {
      return existing;
    }

    return {
      runtime: 'node',
      cpu: DEFAULT_RESOURCE_LIMITS.cpu,
      memory: DEFAULT_RESOURCE_LIMITS.memory,
      storage: DEFAULT_RESOURCE_LIMITS.storage,
      createdAt: Date.now(),
    };
  }

  async validateEnvironment(): Promise<boolean> {
    return this.checkSecurityPolicies();
  }

  private async checkSecurityPolicies(): Promise<boolean> {
    const state = this.ensureState();
    const hasIsolation = state.securityContext.isolated;
    const hasPermissions = state.securityContext.permissions.length === 0;

    return hasIsolation && hasPermissions;
  }

  onStateUpdate(state: SandboxState | undefined): void {
    if (!state) {
      return;
    }

    if (state.executionHistory.length > 100) {
      const trimmedHistory = state.executionHistory.slice(-100);
      this.setState({
        ...state,
        executionHistory: trimmedHistory,
      });
    }
  }
}
