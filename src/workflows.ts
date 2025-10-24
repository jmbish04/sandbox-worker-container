export interface WorkflowEvent<TParams = Record<string, unknown>> {
  id?: string;
  params?: TParams;
}

export interface ErrorAnalysisParams {
  error?: string;
  stackTrace?: string;
  diagnostics?: Record<string, unknown>;
}

export interface ValidationParams {
  solution?: string;
  requirements?: string[];
  testCases?: Array<Record<string, unknown>>;
}

export interface TestingParams {
  test?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export class ErrorAnalysisWorkflow {
  async run(event: WorkflowEvent<ErrorAnalysisParams>): Promise<{
    patterns: Array<{ pattern: string; confidence: number }>;
    suggestions: string[];
    requiresIteration: boolean;
  }> {
    const error = event.params?.error ?? 'unknown-error';
    const stackTrace = event.params?.stackTrace ?? '';

    const patterns: Array<{ pattern: string; confidence: number }> = [];
    if (error !== 'unknown-error') {
      patterns.push({ pattern: error, confidence: 0.8 });
    }

    if (stackTrace.includes('TypeError')) {
      patterns.push({ pattern: 'TypeError', confidence: 0.6 });
    }

    if (stackTrace.includes('ReferenceError')) {
      patterns.push({ pattern: 'ReferenceError', confidence: 0.6 });
    }

    if (patterns.length === 0) {
      patterns.push({ pattern: 'no-error', confidence: 0.9 });
    }

    const suggestions = patterns.map((pattern) => `Investigate pattern: ${pattern.pattern}`);

    return {
      patterns,
      suggestions,
      requiresIteration: patterns.some((pattern) => pattern.confidence < 0.7),
    };
  }
}

export class ValidationWorkflow {
  async run(event: WorkflowEvent<ValidationParams>): Promise<{
    allTestsPassed: boolean;
    coverage?: number;
    performanceMetrics?: Record<string, unknown>;
  }> {
    const testCases = event.params?.testCases ?? [];

    const totalCases = testCases.length;
    const passedCases = testCases.filter((testCase) => {
      const expected = testCase.expected ?? testCase.expectedOutput;
      const actual = testCase.actual ?? testCase.actualOutput;
      return expected === undefined || expected === actual;
    }).length;

    const allTestsPassed = totalCases === passedCases;
    const coverage = totalCases > 0 ? passedCases / totalCases : 1;

    return {
      allTestsPassed,
      coverage,
      performanceMetrics: {
        evaluatedAt: Date.now(),
        totalCases,
        passedCases,
      },
    };
  }
}

export class TestingWorkflow {
  async run(event: WorkflowEvent<TestingParams>): Promise<{
    status: 'passed' | 'failed' | 'skipped';
    durationMs: number;
    coverage?: Record<string, number>;
    details?: Record<string, unknown>;
  }> {
    const start = Date.now();
    const test = event.params?.test ?? {};
    const expected = test.expected ?? test.expectedOutput;
    const actual = test.actual ?? test.actualOutput;

    let status: 'passed' | 'failed' | 'skipped' = 'skipped';
    if (expected !== undefined && actual !== undefined) {
      status = expected === actual ? 'passed' : 'failed';
    }

    const durationMs = Math.max(1, Date.now() - start);

    return {
      status,
      durationMs,
      coverage: test.coverage as Record<string, number> | undefined,
      details: {
        testName: (test.name as string | undefined) ?? 'unnamed-test',
        evaluatedAt: start,
      },
    };
  }
}
