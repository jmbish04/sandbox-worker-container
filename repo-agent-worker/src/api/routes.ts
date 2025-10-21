import { Hono } from 'hono';
import { proxyToSandbox } from '@cloudflare/sandbox';
import type { Env } from '../types';
import { getDefaultSandbox, runSandboxHealthcheck } from '../core/sandbox';

const bindingsToCheck: Array<keyof Env> = [
  'GITHUB_TOKEN',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
];

export const apiRoutes = new Hono<{ Bindings: Env }>();

apiRoutes.post('/invoke/:pathway', async (c) => {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (error) {
    return c.json({ error: 'Invalid JSON body', details: error instanceof Error ? error.message : String(error) }, 400);
  }

  if (!payload || typeof payload !== 'object') {
    return c.json({ error: 'Body must be an object' }, 400);
  }

  const pathway = c.req.param('pathway');

  const sandbox = getDefaultSandbox(c.env);
  const upstreamRequest = new Request(`https://sandbox.internal/api/invoke/${encodeURIComponent(pathway)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  try {
    const response = await proxyToSandbox(upstreamRequest, sandbox);
    const cloned = response.clone();
    const contentType = cloned.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const data = await cloned.json().catch(() => undefined);
      return c.json(data ?? { status: response.statusText || 'ok' }, response.status);
    }

    const text = await cloned.text().catch(() => undefined);
    return c.json(
      {
        status: response.ok ? 'started' : 'error',
        pathway,
        message: text ?? 'Sandbox responded without payload',
      },
      response.status,
    );
  } catch (error) {
    return c.json(
      {
        error: 'Failed to reach sandbox',
        details: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
});

apiRoutes.get('/health', async (c) => {
  const sandbox = await runSandboxHealthcheck(c.env);
  const bindings = Object.fromEntries(
    bindingsToCheck.map((binding) => [
      binding,
      {
        present: Boolean(c.env[binding]),
        note: c.env[binding] ? 'Configured' : 'Missing',
      },
    ]),
  );

  const hasMissingBinding = Object.values(bindings).some((entry) => !entry.present);
  let status: 'ok' | 'degraded' | 'error' = 'ok';
  if (sandbox.status === 'error' || hasMissingBinding) {
    status = 'error';
  } else if (sandbox.status !== 'ok') {
    status = 'degraded';
  }

  return c.json({
    status,
    checks: {
      sandbox,
      bindings,
    },
  });
});
