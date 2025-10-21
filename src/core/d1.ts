import type { KvNamespace, TaskLogEntry } from '../types';

export type TaskRequestStatus = 'pending' | 'running' | 'success' | 'failed';

export interface TaskRequestRow {
  id: string;
  pathway: string;
  status: TaskRequestStatus;
  initial_prompt: string;
  repo_url: string | null;
  created_at: string;
  ended_at: string | null;
}

export interface AiOperationRow {
  id: number;
  task_request_id: string;
  timestamp: string;
  agent_name: string;
  ai_provider: string | null;
  thought: string | null;
  prompt: string | null;
  response: string | null;
}

export interface ContainerOperationRow {
  id: number;
  task_request_id: string;
  timestamp: string;
  stream: string;
  log_content: string;
  exit_code: number | null;
}

const LOG_CACHE_PREFIX = 'task_logs:';

type D1Result<T> = { results: T[] | null };

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<unknown>;
  all: <T>() => Promise<D1Result<T>>;
  first: <T>() => Promise<T | null>;
};

type D1Database = {
  prepare: (query: string) => D1PreparedStatement;
};

const appendLogToCache = async (kv: KvNamespace | undefined, taskId: string, entry: TaskLogEntry) => {
  if (!kv) {
    return;
  }

  const cacheKey = `${LOG_CACHE_PREFIX}${taskId}`;
  try {
    const raw = await kv.get(cacheKey);
    const logs: TaskLogEntry[] = raw ? JSON.parse(raw) : [];
    logs.push(entry);
    await kv.put(cacheKey, JSON.stringify(logs));
  } catch (error) {
    console.error('Failed to append log to cache', { taskId, error });
  }
};

export const createTaskRequest = async (
  db: D1Database,
  kv: KvNamespace | undefined,
  id: string,
  pathway: string,
  prompt: string,
  repoUrl?: string | null,
) => {
  await db
    .prepare(
      `INSERT INTO task_requests (id, pathway, status, initial_prompt, repo_url) VALUES (?1, ?2, 'pending', ?3, ?4)`,
    )
    .bind(id, pathway, prompt, repoUrl ?? null)
    .run();

  await appendLogToCache(kv, id, {
    type: 'status_update',
    content: `Task ${id} created`,
    timestamp: new Date().toISOString(),
  });
};

export const updateTaskStatus = async (
  db: D1Database,
  kv: KvNamespace | undefined,
  id: string,
  status: TaskRequestStatus,
) => {
  const endedAt = status === 'success' || status === 'failed' ? new Date().toISOString() : null;
  await db
    .prepare(`UPDATE task_requests SET status = ?1, ended_at = COALESCE(?2, ended_at) WHERE id = ?3`)
    .bind(status, endedAt, id)
    .run();

  await appendLogToCache(kv, id, {
    type: 'status_update',
    content: `Task ${id} status updated to ${status}`,
    timestamp: new Date().toISOString(),
  });
};

export const logAiOperation = async (
  db: D1Database,
  kv: KvNamespace | undefined,
  taskId: string,
  agentName: string,
  {
    aiProvider,
    thought,
    prompt,
    response,
  }: { aiProvider?: string | null; thought?: string | null; prompt?: string | null; response?: string | null },
) => {
  await db
    .prepare(
      `INSERT INTO ai_operation_logs (task_request_id, agent_name, ai_provider, thought, prompt, response) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(taskId, agentName, aiProvider ?? null, thought ?? null, prompt ?? null, response ?? null)
    .run();

  await appendLogToCache(kv, taskId, {
    type: 'ai_operation',
    content: thought ?? 'AI operation recorded',
    timestamp: new Date().toISOString(),
    metadata: {
      agentName,
      aiProvider: aiProvider ?? undefined,
      prompt,
      response,
    },
  });
};

export const logContainerOperation = async (
  db: D1Database,
  kv: KvNamespace | undefined,
  taskId: string,
  stream: string,
  logContent: string,
  exitCode?: number | null,
) => {
  await db
    .prepare(
      `INSERT INTO container_operation_logs (task_request_id, stream, log_content, exit_code) VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(taskId, stream, logContent, exitCode ?? null)
    .run();

  await appendLogToCache(kv, taskId, {
    type: 'container_operation',
    content: logContent,
    timestamp: new Date().toISOString(),
    metadata: {
      stream,
      exitCode: exitCode ?? undefined,
    },
  });
};

export const getTaskStatus = async (db: D1Database, id: string) => {
  const row = await db.prepare(`SELECT status, created_at, ended_at FROM task_requests WHERE id = ?1`).bind(id).first<{
    status: TaskRequestStatus;
    created_at: string;
    ended_at: string | null;
  }>();
  return row ?? null;
};

export const getTaskRequest = async (db: D1Database, id: string) => {
  const row = await db
    .prepare(`SELECT id, pathway, status, initial_prompt, repo_url, created_at, ended_at FROM task_requests WHERE id = ?1`)
    .bind(id)
    .first<TaskRequestRow>();
  return row ?? null;
};

export const getTaskLogs = async (db: D1Database, id: string) => {
  const task = await getTaskRequest(db, id);
  if (!task) {
    return null;
  }

  const aiLogsResult = await db
    .prepare(`SELECT id, task_request_id, timestamp, agent_name, ai_provider, thought, prompt, response FROM ai_operation_logs WHERE task_request_id = ?1 ORDER BY timestamp ASC, id ASC`)
    .bind(id)
    .all<AiOperationRow>();

  const containerLogsResult = await db
    .prepare(
      `SELECT id, task_request_id, timestamp, stream, log_content, exit_code FROM container_operation_logs WHERE task_request_id = ?1 ORDER BY timestamp ASC, id ASC`,
    )
    .bind(id)
    .all<ContainerOperationRow>();

  return {
    task,
    aiLogs: aiLogsResult.results ?? [],
    containerLogs: containerLogsResult.results ?? [],
  };
};

export const getRepeatableTasks = async (db: D1Database) => {
  const result = await db
    .prepare(`SELECT pathway, name, description, prompt_template, created_at FROM repeatable_tasks ORDER BY id ASC`)
    .all<{ pathway: string; name: string; description: string | null; prompt_template: string | null; created_at: string }>();
  return result.results ?? [];
};

export const getCachedTaskLogs = async (kv: KvNamespace | undefined, taskId: string) => {
  if (!kv) {
    return [] as TaskLogEntry[];
  }

  const cacheKey = `${LOG_CACHE_PREFIX}${taskId}`;
  try {
    const raw = await kv.get(cacheKey);
    return raw ? (JSON.parse(raw) as TaskLogEntry[]) : [];
  } catch (error) {
    console.error('Failed to read cached logs', { taskId, error });
    return [] as TaskLogEntry[];
  }
};

export type D1DatabaseLike = D1Database;
