import type { AgentTool, AgentToolContext } from '../types/agent-types';

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  registerTool(name: string, tool: AgentTool): void {
    this.tools.set(name, tool);
  }

  getAvailableTools(agentType: string): Array<string> {
    return Array.from(this.tools.entries())
      .filter(([, tool]) => tool.supportedAgents.includes(agentType))
      .map(([name]) => name);
  }

  async executeTool(name: string, params: unknown, context: AgentToolContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return tool.execute(params, { ...context, toolName: name });
  }
}
