import { AgentFactory } from './agent-factory';
import type { Env } from '../types';
import type { AgentResponse } from '../types/agent-types';

interface ChatPayload {
  message: unknown;
  sessionId?: string;
  userId?: string;
}

export async function handleChatRequest(env: Env, payload: ChatPayload): Promise<Response> {
  const factory = new AgentFactory(env);
  const manager = await factory.createConversationManager(payload.sessionId ?? 'default');
  const response = await manager.fetch('https://agent/message', {
    method: 'POST',
    body: JSON.stringify({
      type: 'route_message',
      content: { message: payload.message },
      context: { userId: payload.userId, sessionId: payload.sessionId ?? 'default' },
    }),
    headers: { 'content-type': 'application/json' },
  });

  const agentResponse = (await response.json()) as AgentResponse;
  return new Response(JSON.stringify(agentResponse), {
    headers: { 'content-type': 'application/json' },
  });
}
