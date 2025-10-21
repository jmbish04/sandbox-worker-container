import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import {
  WORKSPACE_REPO_PATH,
  cloneRepository,
  gatherGitDiff,
  readRepositoryStructure,
  redactToken,
} from "./utils";

export async function runStandardization(
  sandbox: SandboxInstance,
  aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<PathwayResult> {
  await cloneRepository(sandbox, req, env);

  const structure = await readRepositoryStructure(sandbox);
  const systemPrompt = [
    "You are a DevOps expert.",
    "Generate a comprehensive AGENTS.md file for this repository,",
    "including instructions for contributors and any automation details.",
    "Provide actionable, concise guidance and highlight important conventions.",
  ].join(" ");

  const aiResponse = await aiClient.generateText({
    system: systemPrompt,
    prompt: [
      `Task prompt: ${req.prompt}`,
      "Repository structure:",
      structure,
    ].join("\n\n"),
  });

  await sandbox.writeFile(`${WORKSPACE_REPO_PATH}/AGENTS.md`, aiResponse);

  const diff = await gatherGitDiff(sandbox);

  return {
    pathway: req.pathway,
    taskId: req.task_id,
    patch: redactToken(diff, env.GITHUB_TOKEN),
  };
}
