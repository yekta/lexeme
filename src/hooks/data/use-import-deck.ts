"use client";

import { useZero } from "@rocicorp/zero/react";

import { commit } from "@/zero/mutate";
import { mutators } from "@/zero/mutators";

export type ImportDeckArgs = {
  name: string;
  description: string;
  learning_profile_id: string;
  cards: { front: string; back: string }[];
};

/**
 * Import a deck and its cards as one mutation, so the destination page renders
 * complete on first paint and the server commits both together — no orphan
 * empty deck if the cards fail. Zero replays it if the tab closes before the
 * server has confirmed.
 */
export function useImportDeck() {
  const zero = useZero();

  const mutate = (input: ImportDeckArgs): string => {
    const id = crypto.randomUUID();
    const cards = input.cards.map((c) => ({
      id: crypto.randomUUID(),
      front: c.front,
      back: c.back,
    }));

    commit(
      zero.mutate(
        mutators.deck.import({
          id,
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
          cards,
        }),
      ),
      {
        kind: "decks",
        rows: [id, ...cards.map((c) => c.id)],
        message: "Failed to import deck",
      },
    );
    return id;
  };

  return { mutate };
}
