import type { CardRow } from "@/lib/types";

/** A client-side temporary id for optimistic rows (replaced on server sync). */
export function tempId<T extends string = string>(): T {
  return crypto.randomUUID() as T;
}

/** Build an optimistic card row with the same FSRS defaults the backend uses. */
export function newCardRow(input: {
  deckId: string;
  front: string;
  back: string;
}): CardRow {
  const now = Date.now();
  return {
    id: tempId(),
    deck_id: input.deckId,
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    learning_steps: 0,
    last_review: null,
    created_at: now,
    updated_at: now,
    front: input.front,
    back: input.back,
    content_updated_at: now,
  } as CardRow;
}
