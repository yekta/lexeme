import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { env } from "@/env";

/**
 * Generates the "back" of a flashcard from its "front", using the deck's
 * recent cards as few-shot context so the output matches the user's
 * conventions (language, translation vs. definition, length, tone, format).
 *
 * The API key stays server-side; this module is only ever called from the
 * tRPC router. Structured outputs constrain the response to `{ back }`.
 */

const backSchema = z.object({
  back: z.string(),
});

const SYSTEM_PROMPT = `You generate the "back" of a flashcard for the app Lexeme. \
You are given the user's previous cards (front → back pairs) and the front of a \
new card. Infer the user's conventions from the examples — the language(s) \
involved, whether backs are translations, definitions, or multiple \
translations, their length, and their tone (formal or friendly) — and produce \
a back for the new card that matches those conventions. Output only the back content, nothing else.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export async function generateBack({
  front,
  priorCards,
}: {
  front: string;
  priorCards: { front: string; back: string }[];
}): Promise<string> {
  const examples =
    priorCards.length > 0
      ? priorCards.map((c) => `Front: ${c.front}\nBack: ${c.back}`).join("\n\n")
      : "(no previous cards yet)";

  const response = await getClient().messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(backSchema), effort: "high" },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Previous cards:\n\n${examples}\n\nNew card front: ${front}\n\nGenerate the back for the new card.`,
      },
    ],
  });

  const back = response.parsed_output?.back?.trim();
  if (!back) {
    throw new Error("Model did not return a usable back side.");
  }
  return back;
}
