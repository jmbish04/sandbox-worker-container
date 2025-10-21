import type { DurableObjectNamespace, DurableObjectStub } from '../types';
import type { Env } from '../types';

export class AgentFactory {
  constructor(private readonly env: Env) {}

  async createTravelAgent(sessionId: string): Promise<DurableObjectStub> {
    return this.getStub(this.env.TRAVEL_AGENT, `travel:${sessionId}`);
  }

  async createConversationManager(conversationId: string): Promise<DurableObjectStub> {
    return this.getStub(this.env.CONVERSATION_MANAGER, `conversation:${conversationId}`);
  }

  async createScrapingAgent(taskId: string): Promise<DurableObjectStub> {
    return this.getStub(this.env.SCRAPING_AGENT, `scraping:${taskId}`);
  }

  async getOrCreateSessionManager(userId: string): Promise<DurableObjectStub> {
    return this.getStub(this.env.SESSION_MANAGER, `session:${userId}`);
  }

  private async getStub(namespace: DurableObjectNamespace, name: string): Promise<DurableObjectStub> {
    const id = namespace.idFromName(name);
    return namespace.get(id);
  }
}
