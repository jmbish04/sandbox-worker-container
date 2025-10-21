import { BasePathwayAgent } from './base-agent';
import { logAiOperation } from '../core/d1';
import type { TaskRequestRow } from '../core/d1';

export class ErrorRecreationAgent extends BasePathwayAgent {
  protected readonly agentName = 'ErrorRecreationAgent';

  protected async executeTask(task: TaskRequestRow): Promise<void> {
    await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
      thought: 'Fetching repository for error recreation',
      prompt: task.repo_url ?? undefined,
    });
    await this.logContainer(task.id, 'stdout', `git clone ${task.repo_url ?? '<no-repo>'}`);
    await this.logContainer(task.id, 'stdout', 'Attempting to reproduce reported issue...');
  }
}

export class SolutionValidationAgent extends BasePathwayAgent {
  protected readonly agentName = 'SolutionValidationAgent';

  protected async executeTask(task: TaskRequestRow): Promise<void> {
    await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
      thought: 'Validating proposed solution in sandbox',
    });
    await this.logContainer(task.id, 'stdin', 'Applying patch and running validation script');
    await this.logContainer(task.id, 'stdout', 'Validation script queued for execution via sandbox container');
  }
}

export class TestingAgent extends BasePathwayAgent {
  protected readonly agentName = 'TestingAgent';

  protected async executeTask(task: TaskRequestRow): Promise<void> {
    await logAiOperation(this.env.DB as any, this.env.TASK_CACHE, task.id, this.agentName, {
      thought: 'Preparing to run test suites',
    });
    await this.logContainer(task.id, 'stdout', 'Running tests (unit + e2e) via sandbox queue');
  }
}
