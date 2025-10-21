import { Hono } from 'hono';
import { getSandbox, proxyToSandbox, Sandbox } from '@cloudflare/sandbox';
import { handleWebSocket } from './core/websocket';
import { getOpenAPISpec } from './api/openapi';
import { apiRoutes } from './api/routes';
import type { Env } from './types';

export { Sandbox };

const app = new Hono<{ Bindings: Env }>();

app.get('/openapi.json', (c) => {
  return c.json(getOpenAPISpec());
});

app.route('/api', apiRoutes);

app.get('/ws', (c) => {
  return handleWebSocket(c.req.raw, c.env);
});

app.get('*', async (c) => {
  const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const sandbox = getSandbox(c.env.Sandbox, 'default-sandbox');
  return proxyToSandbox(c.req.raw, sandbox);
});

app.all('*', async (c) => {
  const sandbox = getSandbox(c.env.Sandbox, 'default-sandbox');
  return proxyToSandbox(c.req.raw, sandbox);
});

export default {
  fetch: app.fetch,
};
