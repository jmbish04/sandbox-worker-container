import type { AgentNamespace } from '@cloudflare/agents';
import type { Sandbox } from './orchestration/sandbox-agent';
import type { TaskOrchestratorActor } from './orchestration/task-orchestrator';
import type {
  ErrorRecreationAgent,
  SolutionValidationAgent,
  TestingAgent,
} from './orchestration/agents';
import type {
  TestingWorkflowResult,
  ValidationWorkflowResult,
  WorkflowBinding,
} from './orchestration/state';

export interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface R2ObjectBody {
  text(): Promise<string>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer | ArrayBufferView | string): Promise<void>;
}

export interface Queue<T = unknown> {
  send(message: T): Promise<void>;
}

export interface D1Statement<T = unknown> {
  bind(...values: unknown[]): D1PreparedStatement<T>;
}

export interface D1PreparedStatement<T = unknown> {
  run(): Promise<void>;
  all(): Promise<{ results: T[] }>;
  first<TRow = T>(): Promise<TRow | null>;
}

export interface D1Database {
  prepare<T = unknown>(query: string): D1Statement<T>;
}

export interface Env {
  SANDBOX: AgentNamespace<Sandbox>;
  TASK_ORCHESTRATOR: AgentNamespace<TaskOrchestratorActor>;
  AGENT_ERROR_RECREATION: AgentNamespace<ErrorRecreationAgent>;
  AGENT_SOLUTION_VALIDATION: AgentNamespace<SolutionValidationAgent>;
  AGENT_TESTING: AgentNamespace<TestingAgent>;
  ERROR_WORKFLOW: WorkflowBinding;
  VALIDATION_WORKFLOW: WorkflowBinding<ValidationWorkflowResult>;
  TESTING_WORKFLOW: WorkflowBinding<TestingWorkflowResult>;
  TASK_QUEUE: Queue<{ taskId: string; type?: string }>;
  RESULT_QUEUE: Queue<Record<string, unknown>>;
  KV_STATE: KvNamespace;
  R2_ARTIFACTS: R2Bucket;
  D1_METRICS: D1Database;
  DB?: D1Database;
  TASK_CACHE?: KvNamespace;
  ASSETS: Fetcher;
  AI: Record<string, unknown>;
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export type TaskLogEntry = {
  type: string;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export type LogMessage = TaskLogEntry;
