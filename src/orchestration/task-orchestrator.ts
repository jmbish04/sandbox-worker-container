import {
  Agent,
  type AgentContext,
  type AgentNamespace,
  getAgentByName,
  type Connection,
  type ConnectionContext,
  type WSMessage,
} from '@cloudflare/agents';
import { nanoid } from 'nanoid';
import type { Env } from '../types';
import { ErrorRecreationAgent, SolutionValidationAgent, TestingAgent } from './agents';
import {
  type ErrorRecreationTask,
  type OrchestratorMetrics,
  type OrchestratorState,
  type StoredTask,
  type TaskDefinition,
  type TestingTask,
  type ValidationTask,
  type WorkflowConfig,
  type WorkflowInstanceState,
  type WorkflowInstanceStatus,
  type WorkflowBinding,
} from './state';

const DEFAULT_ORCHESTRATOR_STATE: OrchestratorState = {
  tasks: {},
  agentStatus: {},
  workflowInstances: {},
  messageQueue: [],
  metrics: {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
  },
  subscribers: [],
};

interface ProcessTaskPayload {
  taskId: string;
}

interface WorkflowStatusPayload {
  instanceId: string;
  workflowBinding: string;
}

export class TaskOrchestratorActor extends Agent<Env, OrchestratorState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    if (!this.state) {
      this.setState({ ...DEFAULT_ORCHESTRATOR_STATE });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/orchestrate') {
      const taskDefinition = await request.json<TaskDefinition>();
      const response = await this.handleOrchestration(taskDefinition);
      return Response.json(response, { status: 202 });
    }

    if (request.method === 'POST' && url.pathname === '/resume') {
      const { taskId } = await request.json<ProcessTaskPayload>();
      await this.schedule(0, 'processTask', { taskId });
      return Response.json({ taskId, status: 'scheduled' });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json(this.ensureState());
    }

    if (request.method === 'GET' && url.pathname === '/metrics') {
      return Response.json(this.ensureState().metrics);
    }

    return new Response('Not found', { status: 404 });
  }

  async processTask(payload: ProcessTaskPayload) {
    const state = this.ensureState();
    const storedTask = state.tasks[payload.taskId];
    if (!storedTask) {
      console.warn(`processTask invoked for unknown task ${payload.taskId}`);
      return;
    }

    const runningTask: StoredTask = {
      ...storedTask,
      status: 'running',
      updatedAt: Date.now(),
    };

    this.updateTaskState(runningTask);

    try {
      const result = await this.dispatchToAgent(storedTask);
      this.finalizeTaskSuccess(runningTask.id, result);

      if (storedTask.workflow) {
        await this.triggerWorkflow(storedTask.workflow, result);
      }

      await this.enqueueResult(runningTask.id, result);
    } catch (error) {
      this.finalizeTaskFailure(runningTask.id, error as Error);
      await this.handleTaskFailure(runningTask.id, error as Error);
    }
  }

  async checkWorkflowStatus(payload: WorkflowStatusPayload) {
    const state = this.ensureState();
    const workflowState = state.workflowInstances[payload.instanceId];
    if (!workflowState) {
      return;
    }

    const workflowBinding = this.resolveWorkflowBinding(payload.workflowBinding);
    if (!workflowBinding) {
      return;
    }

    const instance = workflowBinding.get(payload.instanceId);
    if (!instance || typeof instance.status !== 'function') {
      return;
    }

    try {
      const status = (await instance.status()) as WorkflowInstanceStatus<unknown>;
      this.updateWorkflowInstance(payload.instanceId, status);

      if (status.status === 'running' || status.status === 'pending') {
        await this.schedule(30, 'checkWorkflowStatus', payload);
      }
    } catch (error) {
      console.error('Workflow status check failed', error);
      this.updateWorkflowInstance(payload.instanceId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onConnect(connection: Connection, ctx: ConnectionContext) {
    console.log(`Client connected: ${connection.id}`);
    const state = this.ensureState();
    connection.send(
      JSON.stringify({
        type: 'connected',
        state,
      }),
    );

    this.setState({
      ...state,
      subscribers: [...new Set([...state.subscribers, connection.id])],
    });
  }

  async onMessage(connection: Connection, message: WSMessage) {
    try {
      const data = typeof message === 'string' ? JSON.parse(message) : message;
      if (typeof data !== 'object' || data === null) {
        return;
      }

      if ('type' in data && data.type === 'subscribe') {
        const state = this.ensureState();
        connection.send(
          JSON.stringify({
            type: 'stateUpdate',
            state,
            timestamp: Date.now(),
          }),
        );
      }
    } catch (error) {
      console.error('Failed to process websocket message', error);
    }
  }

  onStateUpdate(state: OrchestratorState | undefined): void {
    if (!state) {
      return;
    }

    this.broadcast(
      JSON.stringify({
        type: 'stateUpdate',
        state,
        timestamp: Date.now(),
      }),
    );
  }

  private ensureState(): OrchestratorState {
    const state = this.state;
    if (state) {
      return state;
    }

    this.setState({ ...DEFAULT_ORCHESTRATOR_STATE });
    return this.ensureState();
  }

  private async handleOrchestration(task: TaskDefinition) {
    const taskId = crypto.randomUUID();
    const state = this.ensureState();

    const storedTask: StoredTask = {
      ...task,
      id: taskId,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const metrics: OrchestratorMetrics = {
      ...state.metrics,
      totalTasks: state.metrics.totalTasks + 1,
      lastDispatchAt: Date.now(),
    };

    this.setState({
      ...state,
      metrics,
      tasks: {
        ...state.tasks,
        [taskId]: storedTask,
      },
      messageQueue: [
        ...state.messageQueue,
        { taskId, status: 'pending', timestamp: Date.now() },
      ],
    });

    await this.schedule(0, 'processTask', { taskId });

    return { taskId, status: 'accepted' as const };
  }

  private updateTaskState(task: StoredTask) {
    const state = this.ensureState();
    this.setState({
      ...state,
      tasks: {
        ...state.tasks,
        [task.id]: task,
      },
    });
  }

  private finalizeTaskSuccess(taskId: string, result: unknown) {
    const state = this.ensureState();
    const existing = state.tasks[taskId];
    if (!existing) {
      return;
    }

    const updatedTask: StoredTask = {
      ...existing,
      status: 'completed',
      updatedAt: Date.now(),
      result,
    };

    this.setState({
      ...state,
      metrics: {
        ...state.metrics,
        completedTasks: state.metrics.completedTasks + 1,
      },
      tasks: {
        ...state.tasks,
        [taskId]: updatedTask,
      },
      messageQueue: [
        ...state.messageQueue,
        { taskId, status: 'completed', timestamp: Date.now() },
      ],
    });
  }

  private finalizeTaskFailure(taskId: string, error: Error) {
    const state = this.ensureState();
    const existing = state.tasks[taskId];
    if (!existing) {
      return;
    }

    const updatedTask: StoredTask = {
      ...existing,
      status: 'failed',
      updatedAt: Date.now(),
      error: {
        message: error.message,
        stack: error.stack,
      },
    };

    this.setState({
      ...state,
      metrics: {
        ...state.metrics,
        failedTasks: state.metrics.failedTasks + 1,
      },
      tasks: {
        ...state.tasks,
        [taskId]: updatedTask,
      },
      messageQueue: [
        ...state.messageQueue,
        { taskId, status: 'failed', timestamp: Date.now() },
      ],
    });
  }

  private async dispatchToAgent(task: StoredTask): Promise<unknown> {
    switch (task.type) {
      case 'error_recreation':
        return this.delegateToAgent<ErrorRecreationTask, ErrorRecreationAgent>(
          this.env.AGENT_ERROR_RECREATION,
          task.agentId ?? 'default',
          'recreate-error',
          task,
        );
      case 'solution_validation':
        return this.delegateToAgent<ValidationTask, SolutionValidationAgent>(
          this.env.AGENT_SOLUTION_VALIDATION,
          task.agentId ?? 'default',
          'validate-solution',
          task,
        );
      case 'testing':
        return this.delegateToAgent<TestingTask, TestingAgent>(
          this.env.AGENT_TESTING,
          task.agentId ?? 'default',
          'run-tests',
          task,
        );
      default:
        throw new Error('Unknown task type');
    }
  }

  private async delegateToAgent<
    T extends TaskDefinition,
    TAgent extends Agent<Env, unknown>,
  >(
    namespace: AgentNamespace<TAgent>,
    agentId: string,
    endpoint: string,
    task: T,
  ): Promise<unknown> {
    const agent = await getAgentByName(namespace, agentId);
    const response = await agent.fetch(`https://agents/${endpoint}` as RequestInfo, {
      method: 'POST',
      body: JSON.stringify(task),
      headers: {
        'content-type': 'application/json',
      },
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Agent ${endpoint} failed: ${message}`);
    }

    return response.json();
  }

  private async triggerWorkflow(workflowConfig: WorkflowConfig, data: unknown) {
    const workflowBinding = this.resolveWorkflowBinding(workflowConfig.name);
    if (!workflowBinding) {
      throw new Error(`Workflow binding ${workflowConfig.name} not found`);
    }

    const instanceId = nanoid(16);
    const instance = await workflowBinding.create({
      id: instanceId,
      params: { ...workflowConfig.params, data },
    });

    const state = this.ensureState();
    this.setState({
      ...state,
      workflowInstances: {
        ...state.workflowInstances,
        [instance.id]: {
          id: instance.id,
          workflowBinding: workflowConfig.name,
          startedAt: Date.now(),
          status: 'running',
        },
      },
    });

    await this.schedule('*/30 * * * * *', 'checkWorkflowStatus', {
      instanceId: instance.id,
      workflowBinding: workflowConfig.name,
    });
  }

  private updateWorkflowInstance(
    instanceId: string,
    status: Pick<WorkflowInstanceStatus<unknown>, 'status' | 'result' | 'error'>,
  ) {
    const state = this.ensureState();
    const existing = state.workflowInstances[instanceId];
    if (!existing) {
      return;
    }

    this.setState({
      ...state,
      workflowInstances: {
        ...state.workflowInstances,
        [instanceId]: {
          ...existing,
          status: status.status === 'pending' ? 'running' : (status.status as WorkflowInstanceState['status']),
          result: status.result ?? existing.result,
          error: status.error ?? existing.error,
        },
      },
    });
  }

  private resolveWorkflowBinding(name: string): WorkflowBinding | undefined {
    const binding = this.env[name as keyof Env];
    if (!binding) {
      return undefined;
    }

    if (
      typeof binding === 'object' &&
      binding !== null &&
      'create' in binding &&
      typeof binding.create === 'function' &&
      'get' in binding &&
      typeof binding.get === 'function'
    ) {
      return binding as WorkflowBinding;
    }

    return undefined;
  }

  private async enqueueResult(taskId: string, result: unknown) {
    if (!this.env.RESULT_QUEUE) {
      return;
    }

    try {
      await this.env.RESULT_QUEUE.send({ taskId, result });
    } catch (error) {
      console.error('Failed to enqueue result message', error);
    }
  }

  private async handleTaskFailure(taskId: string, error: Error) {
    if (!this.env.RESULT_QUEUE) {
      return;
    }

    try {
      await this.env.RESULT_QUEUE.send({
        taskId,
        error: error.message,
        stack: error.stack,
      });
    } catch (queueError) {
      console.error('Failed to enqueue failure message', queueError);
    }
  }
}
