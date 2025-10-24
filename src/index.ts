import { Hono } from 'hono';
import { getSandbox, proxyToSandbox } from '@cloudflare/sandbox';
import { getAgentByName } from '@cloudflare/agents';
import { handleWebSocket } from './core/websocket';
import { getOpenAPISpec } from './api/openapi';
import { apiRoutes } from './api/routes';
import type { Env } from './types';
import { TaskOrchestratorActor } from './orchestration/task-orchestrator';
import { ErrorRecreationAgent, SolutionValidationAgent, TestingAgent } from './orchestration/agents';
import { Sandbox } from './orchestration/sandbox-agent';
import {
  ErrorAnalysisWorkflow,
  TestingWorkflow,
  ValidationWorkflow,
} from './workflows';

const app = new Hono<{ Bindings: Env }>();

app.get('/openapi.json', (c) => {
  return c.json(getOpenAPISpec());
});

app.route('/api', apiRoutes);

app.get('/ws', (c) => {
  return handleWebSocket(c.req.raw, c.env);
});

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse as Response;
  }

  const sandbox = getSandbox(c.env.SANDBOX as any, 'default-sandbox');
  const response = await proxyToSandbox(c.req.raw, sandbox as any);
  return response ?? new Response('Sandbox unavailable', { status: 502 });
});

app.all('*', async (c) => {
  const sandbox = getSandbox(c.env.SANDBOX as any, 'default-sandbox');
  const response = await proxyToSandbox(c.req.raw, sandbox as any);
  return response ?? new Response('Sandbox unavailable', { status: 502 });
});

type QueueMessage<T> = {
  body: T;
};

type QueueBatch<T> = {
  messages: Array<QueueMessage<T>>;
};

type TaskQueuePayload = { taskId?: string };

const QUEUE_ORCHESTRATOR_NAME = 'main-orchestrator';

export default {
  fetch: app.fetch,
  queue: async (batch: QueueBatch<TaskQueuePayload>, env: Env) => {
    const orchestrator = await getAgentByName(
      env.TASK_ORCHESTRATOR,
      QUEUE_ORCHESTRATOR_NAME,
    );

    for (const message of batch.messages) {
      const taskId = message.body?.taskId;
      if (!taskId) {
        console.warn('Received queue message without taskId');
        continue;
      }

      try {
        await orchestrator.fetch('https://orchestrator/resume', {
          method: 'POST',
          body: JSON.stringify({ taskId }),
          headers: {
            'content-type': 'application/json',
          },
        });
      } catch (error) {
        console.error('Failed to start task orchestrator', error);
      }
    }
  },
};

export {
  Sandbox,
  TaskOrchestratorActor,
  ErrorRecreationAgent,
  SolutionValidationAgent,
  TestingAgent,
  ErrorAnalysisWorkflow,
  ValidationWorkflow,
  TestingWorkflow,
};
