import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import {
  WORKSPACE_REPO_PATH,
  cloneRepository,
  parseCommandList,
  readRepositoryStructure,
  redactToken,
} from "./utils";

interface CommandLog {
  command: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface GeneralPathwayResult extends PathwayResult {
  commands: string[];
  logs: CommandLog[];
}

export async function runGeneralPrompt(
  sandbox: SandboxInstance,
  aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<GeneralPathwayResult> {
  await cloneRepository(sandbox, req, env);
  const structure = await readRepositoryStructure(sandbox);

  const commandPlan = await aiClient.generateText({
    system: "You are an expert software operator. Provide shell commands (one per line) to accomplish the user's goal.",
    prompt: [
      req.prompt,
      "Repository structure:",
      structure,
    ].join("\n\n"),
  });

  const commands = parseCommandList(commandPlan);
  const logs: CommandLog[] = [];

  for (const command of commands) {
    const result = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && ${command}`);
    logs.push({
      command,
      success: Boolean(result.success),
      exitCode: Number(result.exitCode ?? (result.success ? 0 : 1)),
      stdout: redactToken(result.stdout, env.GITHUB_TOKEN),
      stderr: redactToken(result.stderr, env.GITHUB_TOKEN),
    });
    if (!result.success) {
      break;
    }
  }

  return {
    pathway: req.pathway,
    taskId: req.task_id,
    commands,
    logs,
  };
}
