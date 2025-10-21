import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

import type { AiClient, AiProvider, WorkerEnv } from "../types";

const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const OPENAI_MODEL = "gpt-4.1-mini";
const CLAUDE_MODEL = "claude-3-5-sonnet-latest";
const GEMINI_MODEL = "gemini-1.5-pro";

function normalizeTextResponse(response: unknown): string {
  if (typeof response === "string") {
    return response;
  }

  if (!response) {
    return "";
  }

  if (typeof response === "object" && "toString" in response) {
    try {
      const text = (response as { toString: () => string }).toString();
      if (text && text !== "[object Object]") {
        return text;
      }
    } catch (error) {
      console.warn("Failed to stringify AI response", error);
    }
  }

  try {
    return JSON.stringify(response);
  } catch (error) {
    console.warn("Failed to JSON stringify AI response", error);
    return String(response);
  }
}

export async function initializeAiClient(
  provider: AiProvider,
  env: WorkerEnv
): Promise<AiClient> {
  switch (provider) {
    case "workers-ai":
      return {
        provider,
        async generateText({ system, prompt }) {
          const messages = [] as Array<{ role: "system" | "user"; content: string }>;
          if (system) {
            messages.push({ role: "system", content: system });
          }
          messages.push({ role: "user", content: prompt });

          const response = await env.AI.run(WORKERS_AI_MODEL, { messages });
          if (response && typeof response === "object" && "response" in response) {
            return normalizeTextResponse((response as { response: unknown }).response);
          }
          return normalizeTextResponse(response);
        },
      };
    case "openai": {
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
      return {
        provider,
        async generateText({ system, prompt, temperature }) {
          const result = await client.chat.completions.create({
            model: OPENAI_MODEL,
            temperature,
            messages: [
              ...(system ? [{ role: "system" as const, content: system }] : []),
              { role: "user" as const, content: prompt },
            ],
          });

          const messageContent = result.choices[0]?.message?.content as unknown;
          if (typeof messageContent === "string") {
            return messageContent;
          }

          if (Array.isArray(messageContent)) {
            return messageContent
              .map((part) => {
                if (typeof part === "string") {
                  return part;
                }
                if (part && typeof part === "object" && "text" in part) {
                  return (part as { text?: string }).text ?? "";
                }
                return "";
              })
              .join("");
          }

          return normalizeTextResponse(messageContent ?? "");
        },
      };
    }
    case "claude": {
      const { default: Anthropic } = await import("anthropic");
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      return {
        provider,
        async generateText({ system, prompt, temperature }) {
          const response = await client.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            temperature,
            system: system ?? undefined,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          });
          const text = response.content
            .map((part: any) => (part.type === "text" ? part.text : normalizeTextResponse(part)))
            .join("\n");
          return text;
        },
      };
    }
    case "gemini": {
      const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = client.getGenerativeModel({ model: GEMINI_MODEL });
      return {
        provider,
        async generateText({ system, prompt, temperature }) {
          const contents = [] as Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
          if (system) {
            contents.push({ role: "user", parts: [{ text: `System Instructions:\n${system}` }] });
          }
          contents.push({ role: "user", parts: [{ text: prompt }] });
          const result = await model.generateContent({
            contents,
            generationConfig: {
              temperature,
            },
          });
          const text = result.response?.text();
          return text ?? normalizeTextResponse(result);
        },
      };
    }
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}
