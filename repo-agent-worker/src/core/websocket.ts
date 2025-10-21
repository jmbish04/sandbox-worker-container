import type { Env, LogMessage } from '../types';

const HEARTBEAT_INTERVAL = 30_000;

const encodeMessage = (message: LogMessage) => JSON.stringify({
  ...message,
  timestamp: message.timestamp ?? new Date().toISOString(),
});

export function handleWebSocket(request: Request, _env: Env): Response {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const send = (message: LogMessage) => {
    try {
      server.send(encodeMessage(message));
    } catch (error) {
      console.error('Failed to send WebSocket message', error);
    }
  };

  server.accept();

  send({ type: 'status_update', content: 'Connected to repo-agent-worker' });

  heartbeat = setInterval(() => {
    send({ type: 'status_update', content: 'heartbeat' });
  }, HEARTBEAT_INTERVAL);

  server.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      return;
    }

    const trimmed = event.data.trim().toLowerCase();
    if (trimmed === 'ping') {
      send({ type: 'status_update', content: 'pong' });
    }
  });

  server.addEventListener('close', () => {
    if (heartbeat) {
      clearInterval(heartbeat);
    }
  });

  server.addEventListener('error', (event) => {
    console.error('WebSocket error', event);
    try {
      server.close(1011, 'Unexpected error');
    } catch (error) {
      console.error('Failed to close WebSocket after error', error);
    }
    if (heartbeat) {
      clearInterval(heartbeat);
    }
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
