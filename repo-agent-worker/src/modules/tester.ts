import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import { WORKSPACE_REPO_PATH, cloneRepository, ensureSuccess, redactToken } from "./utils";

interface BackendTestReport {
  success: boolean;
  stdout: string;
  stderr: string;
}

interface FrontendTestReport extends BackendTestReport {}

interface TestPathwayResult extends PathwayResult {
  backend?: BackendTestReport;
  frontend?: FrontendTestReport;
}

async function runPlaywrightTest(
  sandbox: SandboxInstance,
  specPath: string
): Promise<BackendTestReport> {
  const result = await sandbox.exec(`playwright test ${specPath}`);
  return {
    success: Boolean(result.success),
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export async function runTests(
  sandbox: SandboxInstance,
  aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<TestPathwayResult> {
  const mode = req.context?.test_mode ?? "both";
  const report: TestPathwayResult = {
    pathway: req.pathway,
    taskId: req.task_id,
  };

  if ((mode === "backend" || mode === "both") && req.context?.openapi_url) {
    const headers = req.context.auth_key
      ? { Authorization: `Bearer ${req.context.auth_key}` }
      : undefined;
    const response = await fetch(req.context.openapi_url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to download OpenAPI spec: ${response.status}`);
    }
    const openapiSpec = await response.text();

    const playwrightScript = await aiClient.generateText({
      system: "You are a QA engineer creating Playwright API tests from an OpenAPI specification.",
      prompt: [
        req.prompt,
        "OpenAPI specification:",
        openapiSpec,
      ].join("\n\n"),
    });

    const specPath = `/workspace/api_test.spec.ts`;
    await sandbox.writeFile(specPath, playwrightScript);
    const backendResult = await runPlaywrightTest(sandbox, specPath);
    report.backend = {
      success: backendResult.success,
      stdout: redactToken(backendResult.stdout, env.GITHUB_TOKEN),
      stderr: redactToken(backendResult.stderr, env.GITHUB_TOKEN),
    };
  }

  if (mode === "frontend" || mode === "both") {
    await cloneRepository(sandbox, req, env);
    const installResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && npm install`);
    ensureSuccess(installResult, "Failed to install frontend dependencies");
    const buildResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && npm run build`);
    ensureSuccess(buildResult, "Failed to build frontend application");

    const serverProcess = await sandbox.startProcess(`cd ${WORKSPACE_REPO_PATH} && npm run start`, {
      processId: `server-${req.task_id}`,
    });

    try {
      const playwrightScript = await aiClient.generateText({
        system: "You are a QA engineer writing Playwright end-to-end tests for a web application.",
        prompt: req.prompt,
      });
      const specPath = `/workspace/frontend_test.spec.ts`;
      await sandbox.writeFile(specPath, playwrightScript);
      const frontendResult = await runPlaywrightTest(sandbox, specPath);
      report.frontend = {
        success: frontendResult.success,
        stdout: redactToken(frontendResult.stdout, env.GITHUB_TOKEN),
        stderr: redactToken(frontendResult.stderr, env.GITHUB_TOKEN),
      };
    } finally {
      if (serverProcess && typeof serverProcess.kill === "function") {
        await serverProcess.kill();
      }
    }
  }

  return report;
}
