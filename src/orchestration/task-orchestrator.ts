import { getAgentByName, type AgentNamespace } from '@cloudflare/agents';
import {
  getTaskRequest,
  logAiOperation,
  updateTaskStatus,
  type TaskRequestRow,
} from '../core/d1';
import type { Env, DurableObjectState } from '../types';
import type { BasePathwayAgent } from './base-agent';

interface StartRequestBody {
  taskId?: string;
}

const createJsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });

export class TaskOrchestratorActor {
  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/start' && request.method === 'POST') {
      return this.handleStart(request);
    }

    return createJsonResponse({ error: 'Not found' }, 404);
  }

  private async handleStart(request: Request): Promise<Response> {
    let body: StartRequestBody;
    try {
      body = await request.json<StartRequestBody>();
    } catch (error) {
      return createJsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const taskId = body.taskId;
    if (!taskId) {
      return createJsonResponse({ error: 'taskId is required' }, 400);
    }

    try {
      const task = await getTaskRequest(this.env.DB as any, taskId);
      if (!task) {
        return createJsonResponse({ error: 'Task not found' }, 404);
      }

      await updateTaskStatus(this.env.DB as any, this.env.TASK_CACHE, taskId, 'running');
      await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, taskId, 'TaskOrchestratorActor', {
        thought: `Dispatching pathway ${task.pathway}`,
      });

      const agentNamespace = this.resolveAgentNamespace(task.pathway);
      if (!agentNamespace) {
        await updateTaskStatus(this.env.DB as any, this.env.TASK_CACHE, taskId, 'failed');
        await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, taskId, 'TaskOrchestratorActor', {
          thought: `No agent registered for pathway ${task.pathway}`,
        });
        return createJsonResponse({ error: 'Unknown pathway' }, 400);
      }

      const agentStub = await getAgentByName(agentNamespace, taskId);
      await agentStub.fetch('https://agents/run', {
        method: 'POST',
        body: JSON.stringify(task satisfies TaskRequestRow),
      });

      return createJsonResponse({ taskId, status: 'dispatched' }, 202);
    } catch (error) {
      console.error('TaskOrchestratorActor failed', error);
      await updateTaskStatus(this.env.DB as any, this.env.TASK_CACHE, taskId, 'failed');
      await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, taskId, 'TaskOrchestratorActor', {
        thought: `Dispatch failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return createJsonResponse({ error: 'Failed to dispatch task' }, 500);
    }
  }

  private resolveAgentNamespace(pathway: string): AgentNamespace<BasePathwayAgent> | undefined {
    switch (pathway) {
      case 'error_recreation':
        return this.env.AGENT_ERROR_RECREATION as unknown as AgentNamespace<BasePathwayAgent>;
      case 'solution_validation':
        return this.env.AGENT_SOLUTION_VALIDATION as unknown as AgentNamespace<BasePathwayAgent>;
      case 'testing':
        return this.env.AGENT_TESTING as unknown as AgentNamespace<BasePathwayAgent>;
      default:
        return undefined;
    }
  }
}
