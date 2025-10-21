import { Agent, type AgentContext } from '@cloudflare/agents';
import type { Env } from '../types';
import {
  logAiOperation,
  logContainerOperation,
  updateTaskStatus,
  type TaskRequestRow,
} from '../core/d1';

export abstract class BasePathwayAgent extends Agent<Env> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
  }

  protected abstract readonly agentName: string;

  protected abstract executeTask(task: TaskRequestRow): Promise<void>;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/run' || request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    let task: TaskRequestRow;
    try {
      task = await request.json<TaskRequestRow>();
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid task payload' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    try {
      await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
        thought: `Starting pathway ${task.pathway}`,
      });
      await this.executeTask(task);
      await updateTaskStatus(this.env.DB as any, this.env.TASK_CACHE, task.id, 'success');
      await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
        thought: 'Task completed successfully',
      });
      return new Response(JSON.stringify({ status: 'completed' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${this.agentName} failed`, error);
      await updateTaskStatus(this.env.DB as any, this.env.TASK_CACHE, task.id, 'failed');
      await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
        thought: `Task failed: ${message}`,
      });
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  protected async logContainer(taskId: string, stream: string, message: string, exitCode?: number) {
    await logContainerOperation(this.env.DB as any, this.env.TASK_CACHE, taskId, stream, message, exitCode);
  }
}
