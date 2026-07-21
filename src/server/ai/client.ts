import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/env";

let client: Anthropic | null = null;
export function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}
