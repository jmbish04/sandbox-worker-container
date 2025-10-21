import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import { WORKSPACE_REPO_PATH, cloneRepository, ensureSuccess, redactToken } from "./utils";

interface ValidationReport extends PathwayResult {
  applied: boolean;
  tests_passed: boolean;
  logs: string;
}

export async function runValidation(
  sandbox: SandboxInstance,
  _aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<ValidationReport> {
  await cloneRepository(sandbox, req, env);

  const patchContent = req.context?.patch_content;
  if (!patchContent || typeof patchContent !== "string") {
    throw new Error("validate_fix pathway requires context.patch_content");
  }

  await sandbox.writeFile(`/workspace/fix.patch`, patchContent);
  const applyResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && git apply /workspace/fix.patch`);
  ensureSuccess(applyResult, "Failed to apply patch");

  const installResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && npm install`);
  const testResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && npm test`);

  const combinedLogs = [installResult.stdout, installResult.stderr, testResult.stdout, testResult.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    pathway: req.pathway,
    taskId: req.task_id,
    applied: true,
    tests_passed: Boolean(testResult.success),
    logs: redactToken(combinedLogs, env.GITHUB_TOKEN),
  };
}
