import type { Env, LogMessage } from '../types';
import { getCachedTaskLogs } from './d1';

const HEARTBEAT_INTERVAL = 30_000;

const encodeMessage = (message: LogMessage) =>
  JSON.stringify({
    ...message,
    timestamp: message.timestamp ?? new Date().toISOString(),
  });

const LOG_POLL_INTERVAL = 2_000;

export function handleWebSocket(request: Request, env: Env): Response {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let poller: ReturnType<typeof setInterval> | undefined;

  const send = (message: LogMessage) => {
    try {
      server.send(encodeMessage(message));
    } catch (error) {
      console.error('Failed to send WebSocket message', error);
    }
  };

  server.accept();

  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get('task_id');

  // Send initial connection status
  if (taskId) {
    send({ type: 'status_update', content: `Connected to repo-agent-worker for task ${taskId}` });
  } else {
    send({ type: 'status_update', content: 'Connected to repo-agent-worker (monitoring mode)' });
  }

  // Start heartbeat to keep connection alive
  heartbeat = setInterval(() => {
    send({ type: 'status_update', content: 'heartbeat' });
  }, HEARTBEAT_INTERVAL);

  // Only poll logs if we have a task_id
  if (taskId) {
    let lastSent = 0;

    const pollLogs = async () => {
      try {
        const cachedLogs = await getCachedTaskLogs(env.TASK_CACHE, taskId);
        if (!cachedLogs.length || cachedLogs.length === lastSent) {
          return;
        }

        for (let index = lastSent; index < cachedLogs.length; index += 1) {
          send(cachedLogs[index]);
        }
        lastSent = cachedLogs.length;
      } catch (error) {
        console.error('Failed to poll cached logs', error);
      }
    };

    pollLogs().catch((error) => console.error('Initial log poll failed', error));
    poller = setInterval(() => {
      pollLogs().catch((error) => console.error('Repeated log poll failed', error));
    }, LOG_POLL_INTERVAL);
  }

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
    if (poller) {
      clearInterval(poller);
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
    if (poller) {
      clearInterval(poller);
    }
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
