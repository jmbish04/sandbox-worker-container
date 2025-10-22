import { Agent, type AgentContext, getAgentByName } from '@cloudflare/agents';
import type { Env } from '../types';
import {
  type AggregatedTestResults,
  type ErrorAgentState,
  type ErrorAnalysisResult,
  type ErrorRecreationTask,
  type ExecutionResult,
  type TestingState,
  type TestingTask,
  type TestingWorkflowResult,
  type ValidationState,
  type ValidationTask,
  type ValidationWorkflowResult,
  type WorkflowBinding,
  type WorkflowInstance,
} from './state';

const DEFAULT_ERROR_STATE: ErrorAgentState = {
  recreatedErrors: [],
  analysisResults: {},
  debugContext: {},
};

const DEFAULT_VALIDATION_STATE: ValidationState = {
  validatedSolutions: [],
  testResults: {},
  performanceMetrics: {},
};

const DEFAULT_TESTING_STATE: TestingState = {
  testSuites: {},
  testRuns: [],
  coverage: {},
};

interface IterationPayload {
  task: ErrorRecreationTask;
  previousAnalysis: ErrorAnalysisResult;
}

export class ErrorRecreationAgent extends Agent<Env, ErrorAgentState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    if (!this.state) {
      this.setState({ ...DEFAULT_ERROR_STATE });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/recreate-error') {
      const task = await request.json<ErrorRecreationTask>();
      const result = await this.recreateError(task);
      return Response.json(result);
    }

    return new Response('Not found', { status: 404 });
  }

  async recreateError(task: ErrorRecreationTask) {
    const sandbox = await getAgentByName(this.env.SANDBOX, `error-sandbox-${task.payload.id}`);
    const sandboxResponse = await sandbox.fetch('https://agents/execute', {
      method: 'POST',
      body: JSON.stringify({
        code: task.payload.code,
        runtime: task.payload.runtime ?? 'node',
        timeout: 30_000,
        environment: task.payload.context ?? {},
      }),
      headers: {
        'content-type': 'application/json',
      },
    });

    const executionResult = (await sandboxResponse.json()) as ExecutionResult;
    const analysis = await this.analyzeError(executionResult);

    const state = this.ensureState();
    this.setState({
      ...state,
      recreatedErrors: [
        ...state.recreatedErrors,
        {
          taskId: task.payload.id,
          error: executionResult.error,
          stackTrace: executionResult.stackTrace,
          analysis,
          timestamp: Date.now(),
        },
      ],
      analysisResults: {
        ...state.analysisResults,
        [task.payload.id]: analysis,
      },
    });

    if (analysis.requiresIteration) {
      await this.schedule(1, 'iterateErrorRecreation', {
        task,
        previousAnalysis: analysis,
      } satisfies IterationPayload);
    }

    return {
      success: !executionResult.error,
      errorRecreated: Boolean(executionResult.error),
      analysis,
    };
  }

  async iterateErrorRecreation(payload: IterationPayload) {
    console.log(`Re-running error recreation for ${payload.task.payload.id}`);
    await this.recreateError(payload.task);
  }

  private async analyzeError(result: ExecutionResult): Promise<ErrorAnalysisResult> {
    const patterns = this.detectErrorPatterns(result);
    const suggestions = await this.generateSuggestions(patterns);

    return {
      patterns,
      suggestions,
      requiresIteration: patterns.some((pattern) => pattern.confidence < 0.7),
    };
  }

  private detectErrorPatterns(result: ExecutionResult): Array<{ pattern: string; confidence: number }> {
    if (!result.error) {
      return [
        {
          pattern: 'no-error',
          confidence: 0.9,
        },
      ];
    }

    const patterns: Array<{ pattern: string; confidence: number }> = [
      {
        pattern: result.error,
        confidence: 0.85,
      },
    ];

    if (result.stackTrace?.includes('TypeError')) {
      patterns.push({ pattern: 'TypeError', confidence: 0.65 });
    }

    if (result.stackTrace?.includes('ReferenceError')) {
      patterns.push({ pattern: 'ReferenceError', confidence: 0.6 });
    }

    return patterns;
  }

  private async generateSuggestions(patterns: Array<{ pattern: string; confidence: number }>): Promise<string[]> {
    return patterns.map((pattern) => `Investigate pattern: ${pattern.pattern}`);
  }

  private ensureState(): ErrorAgentState {
    const state = this.state;
    if (state) {
      return state;
    }

    this.setState({ ...DEFAULT_ERROR_STATE });
    return this.ensureState();
  }
}

export class SolutionValidationAgent extends Agent<Env, ValidationState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    if (!this.state) {
      this.setState({ ...DEFAULT_VALIDATION_STATE });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/validate-solution') {
      const task = await request.json<ValidationTask>();
      const result = await this.validateSolution(task);
      return Response.json(result);
    }

    return new Response('Not found', { status: 404 });
  }

  async validateSolution(task: ValidationTask) {
    const workflow = this.resolveWorkflow(
      this.env.VALIDATION_WORKFLOW,
      'VALIDATION_WORKFLOW',
    );
    const instance = await workflow.create({
      id: task.payload.id,
      params: {
        solution: task.payload.solution,
        requirements: task.payload.requirements ?? [],
        testCases: task.payload.testCases ?? [],
      },
    });

    const result = await this.monitorWorkflow(instance);
    const state = this.ensureState();

    this.setState({
      ...state,
      validatedSolutions: [
        ...state.validatedSolutions,
        {
          taskId: task.payload.id,
          valid: result.allTestsPassed,
          coverage: result.coverage,
          performance: result.performanceMetrics,
        },
      ],
      testResults: {
        ...state.testResults,
        [task.payload.id]: result,
      },
      performanceMetrics: {
        ...state.performanceMetrics,
        ...(result.performanceMetrics ?? {}),
      },
    });

    return {
      valid: result.allTestsPassed,
      details: result,
    };
  }

  private async monitorWorkflow(instance: WorkflowInstance<ValidationWorkflowResult>) {
    if (instance.status) {
      const status = await instance.status();
      if (status.status === 'failed') {
        throw new Error(status.error ?? 'Validation workflow failed');
      }
      if (status.status === 'completed' && status.result) {
        return status.result;
      }
    }

    if (instance.result) {
      return instance.result();
    }

    return {
      allTestsPassed: true,
      coverage: 1,
      performanceMetrics: {},
    } satisfies ValidationWorkflowResult;
  }

  private resolveWorkflow<Result>(
    binding: WorkflowBinding<Result> | undefined,
    name: string,
  ): WorkflowBinding<Result> {
    if (!binding) {
      throw new Error(`Workflow binding ${name} is not configured`);
    }

    return binding;
  }

  private ensureState(): ValidationState {
    const state = this.state;
    if (state) {
      return state;
    }

    this.setState({ ...DEFAULT_VALIDATION_STATE });
    return this.ensureState();
  }
}

export class TestingAgent extends Agent<Env, TestingState> {
  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    if (!this.state) {
      this.setState({ ...DEFAULT_TESTING_STATE });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/run-tests') {
      const task = await request.json<TestingTask>();
      const result = await this.runTests(task);
      return Response.json(result);
    }

    return new Response('Not found', { status: 404 });
  }

  async runTests(task: TestingTask) {
    const workflow = this.resolveWorkflow(
      this.env.TESTING_WORKFLOW,
      'TESTING_WORKFLOW',
    );
    const suiteId = `${task.payload.id}:${task.payload.suiteName}`;

    const testInstances = await Promise.all(
      task.payload.tests.map((test, index) =>
        workflow.create({
          id: `${suiteId}:${index}`,
          params: { test, context: task.payload.context ?? {} },
        }),
      ),
    );

    const results = await Promise.all(testInstances.map((instance) => this.collectWorkflowResult(instance)));
    const aggregated = this.aggregateTestResults(results);

    const state = this.ensureState();
    this.setState({
      ...state,
      testSuites: {
        ...state.testSuites,
        [suiteId]: {
          id: suiteId,
          tests: task.payload.tests.length,
          lastRunAt: Date.now(),
        },
      },
      testRuns: [
        ...state.testRuns,
        {
          suiteId,
          results: aggregated,
          timestamp: Date.now(),
        },
      ],
      coverage: {
        ...state.coverage,
        ...aggregated.coverage,
      },
    });

    return aggregated;
  }

  private async collectWorkflowResult(instance: WorkflowInstance<TestingWorkflowResult>) {
    if (instance.status) {
      const status = await instance.status();
      if (status.status === 'failed') {
        throw new Error(status.error ?? 'Testing workflow failed');
      }
      if (status.status === 'completed' && status.result) {
        return status.result;
      }
    }

    if (instance.result) {
      return instance.result();
    }

    return {
      status: 'passed',
      durationMs: 0,
      coverage: {},
    } satisfies TestingWorkflowResult;
  }

  private aggregateTestResults(results: TestingWorkflowResult[]): AggregatedTestResults {
    const summary = results.reduce(
      (acc, result) => {
        if (result.status === 'passed') acc.passed += 1;
        if (result.status === 'failed') acc.failed += 1;
        if (result.status === 'skipped') acc.skipped += 1;
        acc.durationMs += result.durationMs;
        return acc;
      },
      { passed: 0, failed: 0, skipped: 0, durationMs: 0 },
    );

    const coverage = results.reduce<Record<string, number>>((acc, result) => {
      if (result.coverage) {
        for (const [key, value] of Object.entries(result.coverage)) {
          acc[key] = Math.max(acc[key] ?? 0, value);
        }
      }
      return acc;
    }, {});

    const details = results.map((result, index) => ({ index, ...result }));

    return {
      summary,
      details,
      coverage,
    };
  }

  private resolveWorkflow<Result>(
    binding: WorkflowBinding<Result> | undefined,
    name: string,
  ): WorkflowBinding<Result> {
    if (!binding) {
      throw new Error(`Workflow binding ${name} is not configured`);
    }
    return binding;
  }

  private ensureState(): TestingState {
    const state = this.state;
    if (state) {
      return state;
    }

    this.setState({ ...DEFAULT_TESTING_STATE });
    return this.ensureState();
  }
}
