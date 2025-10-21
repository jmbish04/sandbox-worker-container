declare module "anthropic" {
  type MessageContent = Array<{ type: string; text?: string }>;

  interface MessageCreateParams {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string;
    messages: Array<{ role: string; content: string }>;
  }

  export default class Anthropic {
    constructor(options: { apiKey: string });
    messages: {
      create(params: MessageCreateParams): Promise<{ content: MessageContent }>;
    };
  }
}
