import { generateBack } from "@/server/ai/generate-back";
import { generateFront } from "@/server/ai/generate-front";

/**
 * Suggests a whole new flashcard by chaining the two single-side generators:
 * first a front from all existing fronts in the deck (dedupe needs the full
 * list), then a back for that front from the deck's recent cards (conventions
 * only need a few examples). No prompt of its own — backs stay consistent
 * whether the user typed the front or generated it.
 */
export async function generateCard({
  existingFronts,
  rejectedFronts,
  recentCards,
}: {
  existingFronts: string[];
  rejectedFronts?: string[];
  recentCards: { front: string; back: string }[];
}): Promise<{ front: string; back: string }> {
  const front = await generateFront({ existingFronts, rejectedFronts });
  const back = await generateBack({ front, priorCards: recentCards });
  return { front, back };
}
