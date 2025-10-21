import type { ExecResult, InvokeRequest, SandboxInstance, WorkerEnv } from "../types";

export const WORKSPACE_REPO_PATH = "/workspace/repo";

export function sanitizeRepositoryUrl(repoUrl: string, token: string | undefined): string {
  if (!token) {
    return repoUrl;
  }

  try {
    const url = new URL(repoUrl);
    // Avoid leaking the token by only returning the URL string when necessary.
    url.username = token;
    url.password = "";
    return url.toString();
  } catch (error) {
    console.warn("Failed to parse repository URL", error);
    return repoUrl;
  }
}

export async function cloneRepository(
  sandbox: SandboxInstance,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<void> {
  await sandbox.exec(`rm -rf ${WORKSPACE_REPO_PATH}`);
  const authenticatedUrl = sanitizeRepositoryUrl(req.repo_url, env.GITHUB_TOKEN);
  const cloneCommand = `git clone --depth=1 --branch ${req.branch} ${authenticatedUrl} ${WORKSPACE_REPO_PATH}`;
  const cloneResult = await sandbox.exec(cloneCommand);
  ensureSuccess(cloneResult, "Failed to clone repository");
}

export function ensureSuccess(result: ExecResult, message: string): void {
  if (!result.success) {
    const error = new Error(`${message}: ${result.stderr || result.stdout}`.trim());
    (error as Error & { exitCode?: number }).exitCode = result.exitCode;
    throw error;
  }
}

export function parseCommandList(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (error) {
    // Ignore JSON parsing issues; fall back to line parsing.
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const filtered = [] as string[];
  for (const line of lines) {
    if (line.startsWith("```") || line === "`" || line === "```sh" || line === "```bash") {
      continue;
    }
    filtered.push(line.replace(/^[-*]\s+/, ""));
  }

  return filtered;
}

export async function readRepositoryStructure(sandbox: SandboxInstance): Promise<string> {
  const result = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && ls -R`);
  ensureSuccess(result, "Failed to list repository structure");
  return result.stdout;
}

export async function gatherGitDiff(sandbox: SandboxInstance): Promise<string> {
  const diffResult = await sandbox.exec(`cd ${WORKSPACE_REPO_PATH} && git diff`);
  ensureSuccess(diffResult, "Failed to capture repository diff");
  return diffResult.stdout;
}

export function redactToken(input: string, token: string | undefined): string {
  if (!token) {
    return input;
  }
  return input.replaceAll(token, "***");
}
