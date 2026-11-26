import { z } from "zod";

import { generateStructured } from "./client.ts";

const backSchema = z.object({
  back: z.string(),
});

const SYSTEM_PROMPT = `You generate the "back" of a flashcard for the app Lexeme. \
You are given the user's previous cards (front → back pairs) and the front of a \
new card. Infer the user's conventions from the examples: the language(s) \
involved, whether backs are translations, definitions, or multiple \
translations, their length, and their tone (formal or friendly), and produce \
a back for the new card that matches those conventions. When the user's deck \
has no cards yet, write a short definition in the language of the word. \
Output only the back content, nothing else.`;

export async function generateBack({
  front,
  recentCards,
}: {
  front: string;
  recentCards: { front: string; back: string }[];
}): Promise<string> {
  const examples = recentCards.length
    ? recentCards.map((c) => `Front: ${c.front}\nBack: ${c.back}`).join("\n\n")
    : "(none yet)";

  const output = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: `Previous cards:\n\n${examples}\n\nNew card front: ${front}\n\nGenerate the back for the new card.`,
    schema: backSchema,
  });

  const back = output.back.trim();
  if (!back) {
    throw new Error("Model did not return a usable back side.");
  }
  return back;
}
