import type { AgentExecutionContext, AgentResponse, ValidationResult, WeatherIntent } from '../types/agent-types';
import { TravelAgent, type TravelAgentContext, type TravelAgentEnv } from './base-agent';
import { WeatherTool } from '../tools/weather-tool';

export class WeatherAgent extends TravelAgent {
  constructor(ctx: TravelAgentContext, env: TravelAgentEnv) {
    super(ctx, env);
    this.toolRegistry.registerTool('weather', new WeatherTool());
  }

  async handleIntent(intent: WeatherIntent, context?: AgentExecutionContext): Promise<AgentResponse> {
    const weatherResult = await this.toolRegistry.executeTool(
      'weather',
      {
        destination: intent.destination,
        dates: intent.dates,
      },
      context ?? {},
    );

    return {
      type: 'weather_response',
      content: weatherResult,
      confidence: 0.6,
      metadata: {
        intent,
        toolsUsed: ['weather'],
      },
    };
  }

  async validateResponse(response: AgentResponse): Promise<ValidationResult> {
    const hasForecast = Boolean((response.content as { data?: unknown })?.data);
    return {
      valid: hasForecast,
      issues: hasForecast ? [] : ['Missing weather data in response'],
      confidence: hasForecast ? 0.7 : 0.1,
    };
  }
}
