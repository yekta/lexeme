"use client";

import {
  cardsCollection,
  decksCollection,
  newCardRow,
  type CardRow,
} from "@/db/collections";
import { offlineAction } from "@/db/offline";
import { toastOnPersistError } from "@/db/toast-on-error";
import { useAuth } from "@/hooks/use-auth";

export type ImportDeckArgs = {
  name: string;
  description: string;
  learning_profile_id: string;
  cards: { front: string; back: string }[];
};

type ImportDeckInput = {
  deckId: string;
  userId: string;
  name: string;
  description: string;
  learning_profile_id: string;
  cardRows: CardRow[];
};

// Deck + cards land in one transaction so the destination page renders fully
// on first paint; the `importDeck` mutationFn commits them atomically server
// side (no orphan deck on partial fail) and the outbox replays it if the tab
// closes before the server confirms.
const importDeckAction = offlineAction<ImportDeckInput>("importDeck", (v) => {
  const now = new Date();
  decksCollection.insert({
    id: v.deckId,
    user_id: v.userId,
    name: v.name,
    description: v.description,
    learning_profile_id: v.learning_profile_id,
    created_at: now,
    updated_at: now,
  });
  if (v.cardRows.length > 0) cardsCollection.insert(v.cardRows);
});

/** Import a deck and its cards in a single durable, optimistic transaction. */
export function useImportDeck() {
  const { user } = useAuth();

  const mutate = (input: ImportDeckArgs): string => {
    if (!user) throw new Error("Not signed in.");
    const deckId = crypto.randomUUID();
    const cardRows = input.cards.map((c) =>
      newCardRow({
        id: crypto.randomUUID(),
        deckId,
        userId: user.id,
        front: c.front,
        back: c.back,
      }),
    );

    const tx = importDeckAction({
      deckId,
      userId: user.id,
      name: input.name,
      description: input.description,
      learning_profile_id: input.learning_profile_id,
      cardRows,
    });

    toastOnPersistError(tx, "Failed to import deck");
    return deckId;
  };

  return { mutate };
}
