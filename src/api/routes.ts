import { Hono } from 'hono';
import type { Env } from '../types';
import { runSandboxHealthcheck } from '../core/sandbox';
import {
  createTaskRequest,
  getCachedTaskLogs,
  getRepeatableTasks,
  getTaskLogs,
  getTaskStatus,
} from '../core/d1';

const bindingsToCheck: Array<keyof Env> = [
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
];

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.get('/v1/tasks/pathways', async (c) => {
  try {
    const pathways = await getRepeatableTasks(c.env.DB as any);
    return c.json({ pathways });
  } catch (error) {
    console.error('Failed to load repeatable tasks', error);
    return c.json({ error: 'Failed to load pathways' }, 500);
  }
});

apiRoutes.post('/v1/tasks/invoke', async (c) => {
  let payload: Record<string, unknown>;
  try {
    payload = await c.req.json<Record<string, unknown>>();
  } catch (error) {
    return c.json({ error: 'Invalid JSON body', details: error instanceof Error ? error.message : String(error) }, 400);
  }

  const pathway = typeof payload.pathway === 'string' ? payload.pathway : undefined;
  const initialPrompt = payload.prompt ?? payload;
  const repoUrl = typeof payload.repo_url === 'string' ? payload.repo_url : undefined;

  if (!pathway) {
    return c.json({ error: 'pathway is required' }, 400);
  }

  const taskId = crypto.randomUUID();
  try {
    await createTaskRequest(c.env.DB as any, c.env.TASK_CACHE, taskId, pathway, JSON.stringify(initialPrompt), repoUrl ?? null);
    await c.env.TASK_QUEUE.send({ taskId });
  } catch (error) {
    console.error('Failed to enqueue task', error);
    return c.json({ error: 'Failed to create task' }, 500);
  }

  const url = new URL(c.req.url);
  const wsUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/ws?task_id=${taskId}`;
  return c.json(
    {
      task_id: taskId,
      status: 'accepted',
      pathway,
      websocket: wsUrl,
    },
    202,
  );
});

apiRoutes.get('/v1/tasks/:id/status', async (c) => {
  const taskId = c.req.param('id');
  try {
    const status = await getTaskStatus(c.env.DB as any, taskId);
    if (!status) {
      return c.json({ error: 'Task not found' }, 404);
    }
    return c.json({ task_id: taskId, ...status });
  } catch (error) {
    console.error('Failed to fetch task status', error);
    return c.json({ error: 'Failed to fetch status' }, 500);
  }
});

apiRoutes.get('/v1/tasks/:id/logs', async (c) => {
  const taskId = c.req.param('id');
  try {
    const logs = await getTaskLogs(c.env.DB as any, taskId);
    if (!logs) {
      return c.json({ error: 'Task not found' }, 404);
    }
    const cached = await getCachedTaskLogs(c.env.TASK_CACHE, taskId);
    return c.json({
      task_id: taskId,
      task: logs.task,
      ai_logs: logs.aiLogs,
      container_logs: logs.containerLogs,
      cached_logs: cached,
    });
  } catch (error) {
    console.error('Failed to fetch task logs', error);
    return c.json({ error: 'Failed to fetch logs' }, 500);
  }
});

apiRoutes.get('/health', async (c) => {
  const sandbox = await runSandboxHealthcheck(c.env);
  const bindings = Object.fromEntries(
    bindingsToCheck.map((binding) => [
      binding,
      {
        present: Boolean(c.env[binding]),
        note: c.env[binding] ? 'Configured' : 'Missing',
      },
    ]),
  );

  const hasMissingBinding = Object.values(bindings).some((entry) => !entry.present);
  let status: 'ok' | 'degraded' | 'error' = 'ok';
  if (sandbox.status === 'error' || hasMissingBinding) {
    status = 'error';
  } else if (sandbox.status !== 'ok') {
    status = 'degraded';
  }

  return c.json({
    status,
    checks: {
      sandbox,
      bindings,
    },
  });
});
