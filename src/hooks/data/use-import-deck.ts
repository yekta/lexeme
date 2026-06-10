"use client";

import { useMutation } from "convex/react";

import { runMutation } from "@/db/mutations";
import { newCardRow, tempId } from "@/db/optimistic";
import { api } from "@/lib/convex-api";

export type ImportDeckArgs = {
  name: string;
  description: string;
  learning_profile_id: string;
  cards: { front: string; back: string }[];
};

/**
 * Import a deck and its cards in a single optimistic Convex mutation. Both the
 * deck list and the card store receive their rows immediately so the
 * destination page renders fully on first paint; the backend commits everything
 * in one (atomic) mutation. Resolves to the new deck id for navigation.
 */
export function useImportDeck() {
  const importDeck = useMutation(api.decks.importDeck).withOptimisticUpdate(
    (store, args) => {
      const tempDeckId = tempId();
      const decks = store.getQuery(api.decks.list, {});
      if (decks !== undefined) {
        const temp = {
          id: tempDeckId,
          name: args.name,
          description: args.description,
          learning_profile_id: args.learning_profile_id,
          created_at: Date.now(),
        } as (typeof decks)[number];
        store.setQuery(api.decks.list, {}, [temp, ...decks]);
      }
      const cards = store.getQuery(api.cards.listByUser, {});
      if (cards !== undefined && args.cards.length > 0) {
        const rows = args.cards.map((c) =>
          newCardRow({ deckId: tempDeckId, front: c.front, back: c.back }),
        ) as typeof cards;
        store.setQuery(api.cards.listByUser, {}, [...rows, ...cards]);
      }
    },
  );

  const mutate = async (input: ImportDeckArgs): Promise<string> => {
    const id = await runMutation(
      "decks",
      importDeck({
        name: input.name,
        description: input.description,
        learning_profile_id: input.learning_profile_id,
        cards: input.cards,
      }),
      "Failed to import deck",
    );
    return id as string;
  };

  return { mutate };
}
