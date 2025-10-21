import type {
  AgentExecutionContext,
  AgentResponse,
  DestinationIntent,
  ValidationResult,
} from '../types/agent-types';
import { TravelAgent, type TravelAgentContext, type TravelAgentEnv } from './base-agent';
import { WebSearchTool } from '../tools/search-tool';

export class DestinationAgent extends TravelAgent {
  constructor(ctx: TravelAgentContext, env: TravelAgentEnv) {
    super(ctx, env);
    this.toolRegistry.registerTool('search', new WebSearchTool());
  }

  async handleIntent(intent: DestinationIntent, context?: AgentExecutionContext): Promise<AgentResponse> {
    const searchResult = await this.toolRegistry.executeTool(
      'search',
      {
        query: intent.query,
        filters: { preferences: intent.preferences, budget: intent.budget },
      },
      context ?? {},
    );

    return {
      type: 'destination_response',
      content: {
        destinations: searchResult,
        searchMetadata: {
          query: intent.query,
        },
      },
      confidence: 0.55,
      metadata: {
        intent,
        toolsUsed: ['search'],
      },
    };
  }

  async validateResponse(response: AgentResponse): Promise<ValidationResult> {
    const destinations = (response.content as { destinations?: { results?: Array<unknown> } })?.destinations;
    const hasResults = Array.isArray(destinations?.results) && destinations.results.length > 0;

    return {
      valid: hasResults,
      issues: hasResults ? [] : ['Destination search returned no results'],
      confidence: hasResults ? 0.6 : 0.2,
    };
  }
}
