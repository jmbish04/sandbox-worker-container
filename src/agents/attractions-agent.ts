import type {
  AgentExecutionContext,
  AgentResponse,
  AttractionsIntent,
  ValidationResult,
} from '../types/agent-types';
import { TravelAgent, type TravelAgentContext, type TravelAgentEnv } from './base-agent';
import { AttractionsTool } from '../tools/attractions-tool';

export class AttractionsAgent extends TravelAgent {
  constructor(ctx: TravelAgentContext, env: TravelAgentEnv) {
    super(ctx, env);
    this.toolRegistry.registerTool('attractions', new AttractionsTool());
  }

  async handleIntent(intent: AttractionsIntent, context?: AgentExecutionContext): Promise<AgentResponse> {
    const toolResult = await this.toolRegistry.executeTool(
      'attractions',
      {
        destination: intent.destination,
        interests: intent.interests,
      },
      context ?? {},
    );

    return {
      type: 'attractions_response',
      content: toolResult,
      confidence: 0.45,
      metadata: {
        intent,
        toolsUsed: ['attractions'],
      },
    };
  }

  async validateResponse(response: AgentResponse): Promise<ValidationResult> {
    const attractions = (response.content as { attractions?: Array<unknown> })?.attractions;
    const hasAttractions = Array.isArray(attractions) && attractions.length > 0;

    return {
      valid: hasAttractions,
      issues: hasAttractions ? [] : ['No attractions returned'],
      confidence: hasAttractions ? 0.5 : 0.2,
    };
  }
}
