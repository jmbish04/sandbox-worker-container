import type {
  AgentExecutionContext,
  AgentResponse,
  BookingIntent,
  ToolResult,
  ValidationResult,
} from '../types/agent-types';
import { TravelAgent, type TravelAgentContext, type TravelAgentEnv } from './base-agent';
import { AmadeusFlightTool, AmadeusHotelTool } from '../tools/amadeus-tool';

export class BookingAgent extends TravelAgent {
  constructor(ctx: TravelAgentContext, env: TravelAgentEnv) {
    super(ctx, env);
    this.toolRegistry.registerTool('flights', new AmadeusFlightTool());
    this.toolRegistry.registerTool('hotels', new AmadeusHotelTool());
  }

  async handleIntent(intent: BookingIntent, context?: AgentExecutionContext): Promise<AgentResponse> {
    let primaryTool: string;
    switch (intent.bookingType) {
      case 'flight':
        primaryTool = 'flights';
        break;
      case 'hotel':
        primaryTool = 'hotels';
        break;
      default:
        primaryTool = 'flights';
        break;
    }

    const toolResult = await this.toolRegistry.executeTool(primaryTool, intent.criteria, context ?? {});

    return {
      type: 'booking_response',
      content: {
        bookingType: intent.bookingType,
        result: toolResult,
      },
      confidence: 0.5,
      metadata: {
        intent,
        toolsUsed: [primaryTool],
      },
    };
  }

  async validateResponse(response: AgentResponse): Promise<ValidationResult> {
    const content = response.content as { result?: ToolResult };
    const hasData = Boolean(content?.result);
    return {
      valid: hasData,
      issues: hasData ? [] : ['Booking response missing tool result'],
      confidence: hasData ? 0.55 : 0.2,
    };
  }
}
