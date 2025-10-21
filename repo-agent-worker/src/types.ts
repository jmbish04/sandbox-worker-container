export interface Env {
  Sandbox: DurableObjectNamespace;
  ASSETS: Fetcher;
  AI: Record<string, unknown>;
  GITHUB_TOKEN?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export type LogMessage = {
  type: 'ai_thought' | 'terminal_log' | 'status_update' | string;
  content: string;
  timestamp?: string;
};
