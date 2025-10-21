import type { AgentTool } from '../types/agent-types';

type SearchParams = {
  query: string;
  filters?: Record<string, unknown>;
};

type SearchResult = {
  results: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  confidence: number;
};

export class WebSearchTool implements AgentTool<SearchParams, SearchResult> {
  readonly supportedAgents = ['destination', 'meta', 'attractions'];

  async execute(params: SearchParams): Promise<SearchResult> {
    return {
      results: [
        {
          title: `Placeholder results for ${params.query}`,
          summary: 'Search integration not yet implemented.',
          filters: params.filters ?? {},
        },
      ],
      metadata: {
        source: 'search-placeholder',
        generatedAt: Date.now(),
      },
      confidence: 0.3,
    };
  }
}
