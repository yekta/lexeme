"use client";

import { createTransaction } from "@tanstack/react-db";

import {
  cardsCollection,
  decksCollection,
  newCardRow,
} from "@/db/collections";
import { toastOnPersistError } from "@/db/toast-on-error";
import { trpc } from "@/trpc/vanilla";

export type ImportDeckArgs = {
  name: string;
  description: string;
  learning_profile_id: string;
  cards: { front: string; back: string }[];
};

/**
 * Import a deck and its cards in a single optimistic transaction. Both
 * collections receive their rows immediately so the destination page renders
 * fully on first paint; the server call goes through `decks.import` which
 * commits everything in one DB transaction (no orphan deck on partial fail).
 */
export function useImportDeck() {
  const mutate = (input: ImportDeckArgs): string => {
    const deckId = crypto.randomUUID();
    const cardRows = input.cards.map((c) =>
      newCardRow({
        id: crypto.randomUUID(),
        deckId,
        front: c.front,
        back: c.back,
      }),
    );

    const tx = createTransaction({
      mutationFn: async () => {
        await trpc.decks.import.mutate({
          id: deckId,
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
          cards: cardRows.map((r) => ({
            id: r.id,
            front: r.front,
            back: r.back,
          })),
        });
        // Reconcile optimistic rows with the persisted server state.
        await Promise.all([
          decksCollection.utils.refetch(),
          cardsCollection.utils.refetch(),
        ]);
      },
    });

    tx.mutate(() => {
      decksCollection.insert({
        id: deckId,
        name: input.name,
        description: input.description,
        learning_profile_id: input.learning_profile_id,
        created_at: new Date(),
      });
      if (cardRows.length > 0) cardsCollection.insert(cardRows);
    });

    toastOnPersistError(tx, "Failed to import deck");
    return deckId;
  };

  return { mutate };
}
