import type { Sandbox } from "@cloudflare/sandbox";
type SandboxGetter = typeof import("@cloudflare/sandbox")["getSandbox"];

export type Pathway =
  | "standardize"
  | "reproduce_error"
  | "validate_fix"
  | "run_tests"
  | "analyze_data"
  | "general_prompt";

export type AiProvider = "workers-ai" | "gemini" | "openai" | "claude";

export interface InvokeRequest {
  task_id: string;
  pathway: Pathway;
  prompt: string;
  repo_url: string;
  branch: string;
  ai_provider: AiProvider;
  context?: {
    patch_content?: string;
    openapi_url?: string;
    auth_key?: string;
    test_mode?: "backend" | "frontend" | "both";
    database_download_url?: string;
    [key: string]: unknown;
  };
}

export interface AiClient {
  readonly provider: AiProvider;
  generateText(input: {
    prompt: string;
    system?: string;
    temperature?: number;
  }): Promise<string>;
}

export type SandboxInstance = ReturnType<SandboxGetter>;

export type ExecResult = Awaited<ReturnType<SandboxInstance["exec"]>>;

export interface PathwayResult extends Record<string, unknown> {
  pathway?: Pathway;
  taskId?: string;
}

export interface WorkerEnv {
  Sandbox: DurableObjectNamespace<Sandbox>;
  AI: {
    run: (model: string, input: unknown) => Promise<any>;
  };
  GITHUB_TOKEN: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_API_KEY: string;
}
