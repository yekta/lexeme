import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { getClient } from "@/server/ai/client";

const backSchema = z.object({
  back: z.string(),
});

const SYSTEM_PROMPT = `You generate the "back" of a flashcard for the app Lexeme. \
You are given the user's previous cards (front → back pairs) and the front of a \
new card. Infer the user's conventions from the examples — the language(s) \
involved, whether backs are translations, definitions, or multiple \
translations, their length, and their tone (formal or friendly) — and produce \
a back for the new card that matches those conventions. Output only the back content, nothing else.`;

export async function generateBack({
  front,
  recentCards,
}: {
  front: string;
  recentCards: { front: string; back: string }[];
}): Promise<string> {
  const examples = recentCards
    .map((c) => `Front: ${c.front}\nBack: ${c.back}`)
    .join("\n\n");

  const response = await getClient().responses.parse({
    model: "gpt-5.6-terra",
    max_output_tokens: 1024 * 4,
    reasoning: { effort: "high" },
    text: { format: zodTextFormat(backSchema, "back") },
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: "user",
        content: `Previous cards:\n\n${examples}\n\nNew card front: ${front}\n\nGenerate the back for the new card.`,
      },
    ],
  });

  const back = response.output_parsed?.back?.trim();
  if (!back) {
    throw new Error("Model did not return a usable back side.");
  }
  return back;
}
