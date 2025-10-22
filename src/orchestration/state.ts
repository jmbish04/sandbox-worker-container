import type { AgentNamespace } from '@cloudflare/agents';
import type { Sandbox } from './sandbox-agent';

export type TaskType = 'error_recreation' | 'solution_validation' | 'testing';

export interface WorkflowConfig {
  name: string;
  params?: Record<string, unknown>;
}

export interface ExecutionParams {
  code: string;
  runtime: string;
  timeout?: number;
  memoryLimit?: string;
  cpuLimit?: string;
  environment?: Record<string, string>;
}

export interface ResourceUsageMetrics {
  cpu: number;
  memory: number;
  storage: number;
}

export interface SandboxContainerMetrics extends ResourceUsageMetrics {
  runtime: string;
  createdAt: number;
}

export interface ExecutionResult {
  output: string;
  error?: string;
  stackTrace?: string;
  diagnostics?: Record<string, unknown>;
}

export interface ExecutionHistoryEntry {
  id: string;
  timestamp: number;
  result: ExecutionResult;
  resources: SandboxContainerMetrics;
}

export interface SandboxState {
  initialized: boolean;
  activeContainers: Record<string, SandboxContainerMetrics>;
  resourceUsage: ResourceUsageMetrics;
  executionHistory: ExecutionHistoryEntry[];
  securityContext: {
    isolated: boolean;
    permissions: string[];
  };
}

export interface BaseTaskDefinition {
  workflow?: WorkflowConfig;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorRecreationTask extends BaseTaskDefinition {
  type: 'error_recreation';
  payload: {
    id: string;
    code: string;
    runtime?: string;
    context?: Record<string, unknown>;
  };
}

export interface ValidationTask extends BaseTaskDefinition {
  type: 'solution_validation';
  payload: {
    id: string;
    solution: string;
    requirements?: string[];
    testCases?: Array<Record<string, unknown>>;
  };
}

export interface TestingTask extends BaseTaskDefinition {
  type: 'testing';
  payload: {
    id: string;
    suiteName: string;
    tests: Array<Record<string, unknown>>;
    context?: Record<string, unknown>;
  };
}

export type TaskDefinition = ErrorRecreationTask | ValidationTask | TestingTask;

export type StoredTask<T extends TaskDefinition = TaskDefinition> = T & {
  id: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  error?: { message: string; stack?: string };
};

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentStatusSnapshot {
  agentId: string;
  lastHeartbeat: number;
  activeTaskId?: string;
  status: 'idle' | 'busy' | 'error';
}

export interface WorkflowInstanceState {
  id: string;
  workflowBinding: string;
  startedAt: number;
  status: 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface OrchestratorMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  lastDispatchAt?: number;
}

export interface OrchestratorState {
  tasks: Record<string, StoredTask>;
  agentStatus: Record<string, AgentStatusSnapshot>;
  workflowInstances: Record<string, WorkflowInstanceState>;
  messageQueue: Array<{ taskId: string; status: TaskStatus; timestamp: number }>;
  metrics: OrchestratorMetrics;
  subscribers: string[];
}

export interface ErrorAgentState {
  recreatedErrors: Array<{
    taskId: string;
    error?: string;
    stackTrace?: string;
    analysis: ErrorAnalysisResult;
    timestamp: number;
  }>;
  analysisResults: Record<string, ErrorAnalysisResult>;
  debugContext: Record<string, unknown>;
}

export interface ErrorAnalysisResult {
  patterns: Array<{ pattern: string; confidence: number }>;
  suggestions: string[];
  requiresIteration: boolean;
}

export interface ValidationState {
  validatedSolutions: Array<{
    taskId: string;
    valid: boolean;
    coverage?: number;
    performance?: Record<string, unknown>;
  }>;
  testResults: Record<string, unknown>;
  performanceMetrics: Record<string, unknown>;
}

export interface TestingState {
  testSuites: Record<string, { id: string; tests: number; lastRunAt?: number }>;
  testRuns: Array<{
    suiteId: string;
    results: AggregatedTestResults;
    timestamp: number;
  }>;
  coverage: Record<string, number>;
}

export interface ValidationWorkflowResult {
  allTestsPassed: boolean;
  coverage?: number;
  performanceMetrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TestingWorkflowResult {
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  coverage?: Record<string, number>;
  details?: Record<string, unknown>;
}

export interface AggregatedTestResults {
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
  };
  details: Array<Record<string, unknown>>;
  coverage?: Record<string, number>;
}

export interface WorkflowBinding<Result = unknown> {
  create(options: WorkflowCreateOptions): Promise<WorkflowInstance<Result>>;
  get(id: string): WorkflowInstance<Result>;
}

export interface WorkflowCreateOptions {
  id: string;
  params?: Record<string, unknown>;
}

export interface WorkflowInstance<Result = unknown> {
  id: string;
  status?(): Promise<WorkflowInstanceStatus<Result>>;
  result?(): Promise<Result>;
  signal?(event: string, payload?: unknown): Promise<void>;
}

export interface WorkflowInstanceStatus<Result = unknown> {
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: Result;
  error?: string;
}

export interface QueueMessage<T = unknown> {
  body: T;
}

export interface QueueBatch<T = unknown> {
  messages: Array<QueueMessage<T>>;
}

export type SandboxNamespace = AgentNamespace<Sandbox>;
