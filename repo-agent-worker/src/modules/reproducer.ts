import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import { WORKSPACE_REPO_PATH, cloneRepository, redactToken } from "./utils";

interface ReproductionReport extends PathwayResult {
  reproduced: boolean;
  logs: string;
  recommended_solution: string;
}

export async function runErrorReproduction(
  sandbox: SandboxInstance,
  aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<ReproductionReport> {
  await cloneRepository(sandbox, req, env);

  const packageJsonResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && cat package.json`);
  const packageManifest = packageJsonResult.success ? packageJsonResult.stdout : undefined;

  const installResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && npm install`);
  const testCommand = (req.context?.test_command as string | undefined) ?? "npm test";
  const testResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && ${testCommand}`);

  const installLog = redactToken(installResult.stdout + installResult.stderr, env.GITHUB_TOKEN);
  const testLog = redactToken(testResult.stdout + testResult.stderr, env.GITHUB_TOKEN);

  const analysisPrompt = [
    "You are a senior software engineer helping to reproduce a bug.",
    "Review the installation and test logs and determine whether the issue was reproduced.",
    `Task prompt: ${req.prompt}`,
    `Executed command: ${testCommand}`,
    packageManifest ? `package.json contents:\n${packageManifest}` : "package.json not found.",
    `npm install log:\n${installLog}`,
    `Command log:\n${testLog}`,
  ].join("\n\n");

  const aiSummary = await aiClient.generateText({
    system: "Summarize reproduction status and suggest next steps.",
    prompt: analysisPrompt,
  });

  const reproduced = testResult.success === false;

  return {
    pathway: req.pathway,
    taskId: req.task_id,
    reproduced,
    logs: `${installLog}\n\n${testLog}`.trim(),
    recommended_solution: aiSummary,
  };
}
