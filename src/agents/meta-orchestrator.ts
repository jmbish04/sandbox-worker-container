import type {
  AgentExecutionContext,
  AgentResponse,
  RoutingDecision,
  TravelIntent,
  ValidationResult,
} from '../types/agent-types';
import { TravelAgent, type TravelAgentContext, type TravelAgentEnv } from './base-agent';
import { WeatherAgent } from './weather-agent';
import { DestinationAgent } from './destination-agent';
import { BookingAgent } from './booking-agent';
import { AttractionsAgent } from './attractions-agent';

export class MetaOrchestratorAgent extends TravelAgent {
  private readonly weatherAgent: WeatherAgent;
  private readonly destinationAgent: DestinationAgent;
  private readonly bookingAgent: BookingAgent;
  private readonly attractionsAgent: AttractionsAgent;

  constructor(ctx: TravelAgentContext, env: TravelAgentEnv) {
    super(ctx, env);
    this.weatherAgent = new WeatherAgent(ctx, env);
    this.destinationAgent = new DestinationAgent(ctx, env);
    this.bookingAgent = new BookingAgent(ctx, env);
    this.attractionsAgent = new AttractionsAgent(ctx, env);
  }

  async handleIntent(intent: TravelIntent, context?: AgentExecutionContext): Promise<AgentResponse> {
    const routingDecision = await this.routeIntent(intent);
    const primaryResponse = await this.executeAgent(routingDecision.primaryAgent, intent, context);

    const additionalResponses = await Promise.all(
      routingDecision.additionalAgents.map((agent) => this.executeAgent(agent, intent, context)),
    );

    const blended = this.blendResponses(primaryResponse, additionalResponses);
    return blended;
  }

  async validateResponse(response: AgentResponse): Promise<ValidationResult> {
    const valid = Boolean(response.content);
    return {
      valid,
      issues: valid ? [] : ['Meta orchestrator produced empty response'],
      confidence: valid ? 0.6 : 0.2,
    };
  }

  private async routeIntent(intent: TravelIntent): Promise<RoutingDecision> {
    const type = intent.type ?? 'meta';
    const primaryAgent = this.selectPrimaryAgent(type);
    const additionalAgents = this.suggestAdditionalAgents(type);

    return {
      primaryAgent,
      additionalAgents,
      confidence: 0.6,
    };
  }

  private selectPrimaryAgent(type: string): string {
    switch (type) {
      case 'weather':
        return 'weather';
      case 'destination':
        return 'destination';
      case 'booking':
        return 'booking';
      case 'attractions':
        return 'attractions';
      default:
        return 'destination';
    }
  }

  private suggestAdditionalAgents(type: string): Array<string> {
    const additional = new Set<string>();
    if (type === 'destination') {
      additional.add('weather');
      additional.add('attractions');
    }
    if (type === 'booking') {
      additional.add('weather');
    }
    return Array.from(additional);
  }

  private async executeAgent(
    agent: string,
    intent: TravelIntent,
    context?: AgentExecutionContext,
  ): Promise<AgentResponse> {
    switch (agent) {
      case 'weather':
        return this.weatherAgent.handleIntent(intent as any, context);
      case 'destination':
        return this.destinationAgent.handleIntent(intent as any, context);
      case 'booking':
        return this.bookingAgent.handleIntent(intent as any, context);
      case 'attractions':
        return this.attractionsAgent.handleIntent(intent as any, context);
      default:
        return {
          type: 'noop',
          content: { message: 'No matching agent' },
        };
    }
  }

  private blendResponses(primary: AgentResponse, additional: Array<AgentResponse>): AgentResponse {
    const combined = [primary, ...additional].filter(Boolean);

    return {
      type: 'meta_blended_response',
      content: {
        responses: combined,
      },
      confidence: this.calculateConfidence(combined),
      metadata: {
        toolsUsed: combined.flatMap((response) =>
          Array.isArray(response.metadata?.toolsUsed) ? (response.metadata?.toolsUsed as Array<string>) : [],
        ),
      },
    };
  }

  private calculateConfidence(responses: Array<AgentResponse>): number {
    if (responses.length === 0) {
      return 0;
    }

    const sum = responses.reduce((total, response) => total + (response.confidence ?? 0.4), 0);
    return sum / responses.length;
  }
}
