import { generateBack } from "./generate-back.ts";
import { generateFront } from "./generate-front.ts";

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
  const back = await generateBack({ front, recentCards });
  return { front, back };
}
