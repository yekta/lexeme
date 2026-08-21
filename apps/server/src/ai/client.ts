import Anthropic from "@anthropic-ai/sdk";

import { env } from "../env.ts";

let aiClient: Anthropic | null = null;
export function getClient(): Anthropic {
  aiClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return aiClient;
}

export const aiClientConfig: {
  model: Anthropic.Model;
  maxTokens: number;
} = {
  model: "claude-opus-5",
  maxTokens: 4096,
};
