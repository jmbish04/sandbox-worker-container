export interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectId {}

export interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace<T extends object = DurableObjectStub> {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): T;
}

export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
  waitUntil(promise: Promise<unknown>): void;
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

export interface WorkerQueue<T = unknown> {
  send(message: T): Promise<void>;
}

export interface Env {
  Sandbox: DurableObjectNamespace;
  TASK_ORCHESTRATOR: DurableObjectNamespace;
  AGENT_ERROR_RECREATION: DurableObjectNamespace;
  AGENT_SOLUTION_VALIDATION: DurableObjectNamespace;
  AGENT_TESTING: DurableObjectNamespace;
  TRAVEL_AGENT: DurableObjectNamespace;
  SCRAPING_AGENT: DurableObjectNamespace;
  CONVERSATION_MANAGER: DurableObjectNamespace;
  SESSION_MANAGER: DurableObjectNamespace;
  ASSETS: Fetcher;
  AI: Record<string, unknown>;
  DB: unknown;
  TASK_CACHE: KvNamespace;
  CONTAINER_ASSETS: R2Bucket;
  TASK_QUEUE: WorkerQueue<{ taskId: string }>;
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
