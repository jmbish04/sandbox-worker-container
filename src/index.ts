import { Hono } from 'hono';
import { getSandbox, proxyToSandbox, Sandbox } from '@cloudflare/sandbox';
import { handleWebSocket } from './core/websocket';
import { getOpenAPISpec } from './api/openapi';
import { apiRoutes } from './api/routes';
import type { Env } from './types';
import { TaskOrchestratorActor } from './orchestration/task-orchestrator';
import { ErrorRecreationAgent, SolutionValidationAgent, TestingAgent } from './orchestration/agents';
import { AgentFactory } from './core/agent-factory';

const app = new Hono<{ Bindings: Env }>();

app.get('/openapi.json', (c) => {
  return c.json(getOpenAPISpec());
});

app.route('/api', apiRoutes);

app.post('/chat', async (c) => {
  const body = await c.req.json<{
    message: unknown;
    sessionId?: string;
    userId?: string;
  }>();

  const agentFactory = new AgentFactory(c.env);
  const conversationManager = await agentFactory.createConversationManager(body.sessionId ?? 'default');

  const response = await conversationManager.fetch('https://agent/message', {
    method: 'POST',
    body: JSON.stringify({
      type: 'route_message',
      content: { message: body.message },
      context: { userId: body.userId, sessionId: body.sessionId ?? 'default' },
    }),
    headers: { 'content-type': 'application/json' },
  });

  return response;
});

app.get('/ws', (c) => {
  return handleWebSocket(c.req.raw, c.env);
});

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse as Response;
  }

  const sandbox = getSandbox(c.env.Sandbox as any, 'default-sandbox');
  const response = await proxyToSandbox(c.req.raw, sandbox as any);
  return response ?? new Response('Sandbox unavailable', { status: 502 });
});

app.all('*', async (c) => {
  const sandbox = getSandbox(c.env.Sandbox as any, 'default-sandbox');
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
    const orchestratorId = env.TASK_ORCHESTRATOR.idFromName(QUEUE_ORCHESTRATOR_NAME);
    const orchestrator = env.TASK_ORCHESTRATOR.get(orchestratorId);

    for (const message of batch.messages) {
      const taskId = message.body?.taskId;
      if (!taskId) {
        console.warn('Received queue message without taskId');
        continue;
      }

      try {
        await orchestrator.fetch('https://orchestrator/start', {
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
};
export { TravelAgentDO } from './durable-objects/travel-agent-do';
export { ScrapingAgentDO } from './durable-objects/scraping-agent-do';
export { ConversationManagerDO } from './durable-objects/conversation-manager-do';
export { SessionManagerDO } from './durable-objects/session-manager-do';
