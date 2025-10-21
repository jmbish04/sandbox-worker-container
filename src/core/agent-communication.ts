import type { DurableObjectNamespace, DurableObjectStub } from '../types';
import type { AgentMessage } from '../types/agent-types';

export class AgentCommunicationHub {
  constructor(private readonly namespaces: Record<string, DurableObjectNamespace>) {}

  async sendMessage(fromAgent: string, toAgent: string, message: AgentMessage): Promise<void> {
    const target = await this.getAgentStub(toAgent);
    await target.fetch('https://agent/message', {
      method: 'POST',
      body: JSON.stringify({ ...message, metadata: { ...message.metadata, fromAgent } }),
      headers: { 'content-type': 'application/json' },
    });
  }

  async broadcastMessage(fromAgent: string, message: AgentMessage): Promise<void> {
    const activeAgents = await this.getActiveAgents();
    await Promise.all(
      activeAgents.map((agentId) => this.sendMessage(fromAgent, agentId, message)),
    );
  }

  protected async getAgentStub(agentId: string): Promise<DurableObjectStub> {
    const [namespaceName] = agentId.split(':');
    const namespace = this.namespaces[namespaceName];
    if (!namespace) {
      throw new Error(`Unknown agent namespace: ${namespaceName}`);
    }
    const id = namespace.idFromName(agentId);
    return namespace.get(id);
  }

  protected async getActiveAgents(): Promise<Array<string>> {
    // Placeholder implementation until registry is added
    return Object.keys(this.namespaces);
  }
}
