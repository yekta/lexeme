import { cards } from "@lexeme/db";
import { and, desc, eq, ne } from "drizzle-orm";

import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { generateBack } from "./generate-back.ts";
import { generateFront } from "./generate-front.ts";

/** Cards shown to the model as examples of the user's conventions. */
const BACK_CONTEXT_LIMIT = 20;
/** Fronts shown to the model so it does not suggest one the deck already has. */
const FRONT_CONTEXT_LIMIT = 10_000;

function recentCards(deckId: string, exceptFront?: string) {
  return db
    .select({ front: cards.front, back: cards.back })
    .from(cards)
    .where(and(eq(cards.deck_id, deckId), exceptFront ? ne(cards.front, exceptFront) : undefined))
    .orderBy(desc(cards.created_at))
    .limit(BACK_CONTEXT_LIMIT);
}

/** Callers must have checked the deck belongs to the user. */
export async function generateBackForDeck({
  deckId,
  front,
  context,
}: {
  deckId: string;
  front: string;
  context?: string;
}): Promise<string> {
  const examples = await recentCards(deckId, front);
  if (examples.length === 0) {
    throw new ApiError("PRECONDITION_FAILED", "Add at least one card before generating a back.");
  }
  return generateBack({ front, recentCards: examples, context });
}

/** Callers must have checked the deck belongs to the user. */
export async function generateCardForDeck({
  deckId,
  excludeFronts = [],
}: {
  deckId: string;
  excludeFronts?: string[];
}): Promise<{ front: string; back: string }> {
  const [existing, examples] = await Promise.all([
    db
      .select({ front: cards.front })
      .from(cards)
      .where(eq(cards.deck_id, deckId))
      .orderBy(desc(cards.created_at))
      .limit(FRONT_CONTEXT_LIMIT),
    recentCards(deckId),
  ]);
  if (existing.length === 0) {
    throw new ApiError("PRECONDITION_FAILED", "Add at least one card before suggesting a new one.");
  }

  const front = await generateFront({
    existingFronts: existing.map((card) => card.front),
    rejectedFronts: excludeFronts,
  });
  const back = await generateBack({ front, recentCards: examples });
  return { front, back };
}
