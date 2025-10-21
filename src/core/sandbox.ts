import { getSandbox, proxyToSandbox } from '@cloudflare/sandbox';
import type { Env } from '../types';

export const DEFAULT_SANDBOX_ID = 'repo-agent-default';

export const getDefaultSandbox = (env: Env) => getSandbox(env.Sandbox as any, DEFAULT_SANDBOX_ID);

export const forwardToSandbox = (request: Request, env: Env) => {
  const sandbox = getDefaultSandbox(env);
  return proxyToSandbox(request, sandbox as any);
};

export const runSandboxHealthcheck = async (env: Env) => {
  try {
    const sandbox = getDefaultSandbox(env);
    const response = await sandbox.fetch('http://sandbox/health').catch(() => undefined);
    if (!response) {
      return {
        status: 'unreachable' as const,
        detail: 'No response from sandbox',
      };
    }

    const text = await response.text();
    return {
      status: response.ok ? ('ok' as const) : ('degraded' as const),
      detail: text || 'Sandbox responded without content',
    };
  } catch (error) {
    return {
      status: 'error' as const,
      detail: error instanceof Error ? error.message : 'Unknown sandbox error',
    };
  }
};
