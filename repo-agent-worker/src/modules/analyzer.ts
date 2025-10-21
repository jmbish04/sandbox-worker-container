import type { AiClient, InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "../types";
import { redactToken } from "./utils";

interface AnalysisResult extends PathwayResult {
  report: string;
}

export async function runAnalysis(
  sandbox: SandboxInstance,
  aiClient: AiClient,
  req: InvokeRequest,
  env: WorkerEnv
): Promise<AnalysisResult> {
  const databaseUrl = req.context?.database_download_url;
  if (!databaseUrl || typeof databaseUrl !== "string") {
    throw new Error("analyze_data pathway requires context.database_download_url");
  }

  const downloadResult = await sandbox.exec(
    `curl -sSL -o /workspace/local_copy.db ${databaseUrl}`
  );
  if (!downloadResult.success) {
    throw new Error(`Failed to download database: ${downloadResult.stderr}`);
  }

  const systemPrompt = "You are a data analyst. Generate a Python sqlite3+pandas script to analyze /workspace/local_copy.db.";
  const pythonScript = await aiClient.generateText({
    system: systemPrompt,
    prompt: req.prompt,
  });

  await sandbox.writeFile(`/workspace/analyze.py`, pythonScript);
  const analysisResult = await sandbox.exec(`python /workspace/analyze.py`);

  return {
    pathway: req.pathway,
    taskId: req.task_id,
    report: redactToken(
      (analysisResult.stdout || analysisResult.stderr || "Analysis produced no output.").trim(),
      env.GITHUB_TOKEN
    ),
  };
}
