import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

import { env } from "../env.ts";
import { ApiError } from "../errors.ts";

const MODEL = "claude-opus-5-5";
/** Room for adaptive thinking plus the short answer; thinking counts toward this cap. */
const MAX_TOKENS = 16_000;

let aiClient: Anthropic | null = null;
function getClient(): Anthropic {
  aiClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return aiClient;
}

/** One structured model call. A refusal is retried on a fallback model before it reaches the user. */
export async function generateStructured<TSchema extends z.ZodType>({
  system,
  prompt,
  schema,
}: {
  system: string;
  prompt: string;
  schema: TSchema;
}): Promise<z.infer<TSchema>> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new ApiError("BAD_REQUEST", "The model declined to write this card. Try rewording it.");
  }
  if (response.parsed_output == null) {
    throw new Error(`Model returned no structured output (stop_reason: ${response.stop_reason}).`);
  }
  return response.parsed_output;
}
