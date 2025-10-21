import type { AgentTool } from '../types/agent-types';

type AttractionsParams = {
  destination: string;
  interests?: Array<string>;
};

type AttractionsResult = {
  attractions: Array<Record<string, unknown>>;
  confidence: number;
  metadata: Record<string, unknown>;
};

export class AttractionsTool implements AgentTool<AttractionsParams, AttractionsResult> {
  readonly supportedAgents = ['attractions', 'meta'];

  async execute(params: AttractionsParams): Promise<AttractionsResult> {
    return {
      attractions: [
        {
          name: 'Placeholder Museum',
          destination: params.destination,
          interests: params.interests ?? [],
          summary: 'Attraction data pending real integration.',
        },
      ],
      confidence: 0.35,
      metadata: {
        source: 'attractions-placeholder',
        generatedAt: Date.now(),
      },
    };
  }
}
