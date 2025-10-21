import type { AgentTool } from '../types/agent-types';

type WeatherParams = {
  destination: string;
  dates: Array<string>;
};

type WeatherResult = {
  data: Record<string, unknown>;
  confidence: number;
  metadata: Record<string, unknown>;
};

export class WeatherTool implements AgentTool<WeatherParams, WeatherResult> {
  readonly supportedAgents = ['weather', 'meta'];

  async execute(params: WeatherParams): Promise<WeatherResult> {
    const { destination, dates } = params;

    return {
      data: {
        destination,
        dates,
        forecast: dates.map((date, index) => ({
          date,
          summary: `Placeholder forecast for ${destination} on ${date}`,
          high: 25 + index,
          low: 18 + index,
          precipitationChance: 0.2,
        })),
      },
      confidence: 0.5,
      metadata: {
        source: 'weather-placeholder',
        generatedAt: Date.now(),
      },
    };
  }
}
