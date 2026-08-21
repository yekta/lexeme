import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { aiClientConfig, getClient } from "./client.ts";

const frontSchema = z.object({
  front: z.string(),
});

const SYSTEM_PROMPT = `You suggest the "front" of a new flashcard for the app \
Lexeme. You are given all existing fronts in the user's deck. Infer the deck's \
topic and the user's conventions from them — the language(s) involved, the \
kind of item (words, phrases, questions), length, and formatting — and propose \
one new front that fits the deck and follows those conventions. It must not \
duplicate or trivially restate any existing front. You may also be given \
fronts that were already suggested and passed on this session — never repeat \
those or trivial variations of them. Prefer something the user would \
plausibly learn next at a similar difficulty level. Output only the front \
content, nothing else.`;

export async function generateFront({
  existingFronts,
  rejectedFronts = [],
}: {
  existingFronts: string[];
  rejectedFronts?: string[];
}): Promise<string> {
  const fronts = existingFronts.map((f) => `- ${f}`).join("\n");
  const rejected =
    rejectedFronts.length > 0
      ? `\n\nAlready suggested and passed on this session (do not repeat):\n${rejectedFronts.map((f) => `- ${f}`).join("\n")}`
      : "";

  const response = await getClient().messages.parse({
    model: aiClientConfig.model,
    max_tokens: aiClientConfig.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(frontSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Existing fronts:\n${fronts}${rejected}\n\nSuggest the front of one new card for this deck.`,
      },
    ],
  });

  const front = response.parsed_output?.front?.trim();
  if (!front) {
    throw new Error("Model did not return a usable front side.");
  }
  return front;
}
