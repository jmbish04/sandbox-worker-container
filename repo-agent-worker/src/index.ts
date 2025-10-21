import { getSandbox } from "@cloudflare/sandbox";

import { initializeAiClient } from "./clients/ai";
import type { InvokeRequest, PathwayResult, SandboxInstance, WorkerEnv } from "./types";
import { runAnalysis } from "./modules/analyzer";
import { runErrorReproduction } from "./modules/reproducer";
import { runStandardization } from "./modules/standardizer";
import { runTests } from "./modules/tester";
import { runValidation } from "./modules/validator";
import { runGeneralPrompt } from "./modules/general";

export { Sandbox } from "@cloudflare/sandbox";
export type { WorkerEnv as Env } from "./types";

function isInvokeRequest(payload: unknown): payload is InvokeRequest {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const req = payload as Partial<InvokeRequest>;
  return (
    typeof req.task_id === "string" &&
    typeof req.pathway === "string" &&
    typeof req.prompt === "string" &&
    typeof req.repo_url === "string" &&
    typeof req.branch === "string" &&
    typeof req.ai_provider === "string"
  );
}

async function routePathway(
  sandbox: SandboxInstance,
  env: WorkerEnv,
  request: InvokeRequest
): Promise<PathwayResult> {
  const aiClient = await initializeAiClient(request.ai_provider, env);

  switch (request.pathway) {
    case "standardize":
      return runStandardization(sandbox, aiClient, request, env);
    case "reproduce_error":
      return runErrorReproduction(sandbox, aiClient, request, env);
    case "validate_fix":
      return runValidation(sandbox, aiClient, request, env);
    case "run_tests":
      return runTests(sandbox, aiClient, request, env);
    case "analyze_data":
      return runAnalysis(sandbox, aiClient, request, env);
    case "general_prompt":
    default:
      return runGeneralPrompt(sandbox, aiClient, request, env);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Expected POST", { status: 405 });
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch (error) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    if (!isInvokeRequest(payload)) {
      return new Response("Invalid invoke request", { status: 400 });
    }

    const invokeRequest = payload as InvokeRequest;
    const sandbox = getSandbox(env.Sandbox, invokeRequest.task_id);

    try {
      const result = await routePathway(sandbox, env, invokeRequest);
      return Response.json(result);
    } catch (error) {
      console.error("Pathway execution failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message, pathway: invokeRequest.pathway }, { status: 500 });
    }
  },
};
