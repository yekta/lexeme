"use client";

import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useMemo } from "react";

import { runMutation } from "@/db/mutations";
import { newCardRow } from "@/db/optimistic";
import { api } from "@/lib/convex-api";
import type { CardRow } from "@/lib/types";

export type TCard = CardRow;

/** Every card the user owns, across all decks (newest first). */
export function useAllCards() {
  const { data, isPending, isError, error, refetch } = useQuery(
    convexQuery(api.cards.listByUser, {}),
  );
  return { data: data ?? [], isPending, isError, error, refetch };
}

/** Cards in a deck, newest first — filtered from the global card store. */
export function useCardsByDeck(deckId: string | undefined) {
  const all = useAllCards();
  const data = useMemo(
    () => (deckId ? all.data.filter((c) => c.deck_id === deckId) : []),
    [all.data, deckId],
  );
  return {
    data,
    isPending: all.isPending,
    isError: all.isError,
    error: all.error,
    refetch: all.refetch,
  };
}

function useInsertCards() {
  return useMutation(api.cards.create).withOptimisticUpdate((store, args) => {
    const cards = store.getQuery(api.cards.listByUser, {});
    if (cards === undefined) return;
    const rows = args.cards.map((c) =>
      newCardRow({ deckId: args.deckId, front: c.front, back: c.back }),
    ) as typeof cards;
    store.setQuery(api.cards.listByUser, {}, [...rows, ...cards]);
  });
}

export function useCreateCard() {
  const create = useInsertCards();
  return {
    mutateAsync: async (input: {
      deckId: string;
      front: string;
      back: string;
    }) => {
      await runMutation(
        "cards",
        create({
          deckId: input.deckId,
          cards: [{ front: input.front, back: input.back }],
        }),
        "Failed to create card",
      );
    },
  };
}

/**
 * Bulk-insert cards into a deck in a single mutation round-trip, regardless of
 * card count.
 */
export function useImportCards() {
  const create = useInsertCards();
  return {
    mutate: (input: {
      deckId: string;
      cards: { front: string; back: string }[];
    }) => {
      void runMutation(
        "cards",
        create({ deckId: input.deckId, cards: input.cards }),
        "Failed to import cards",
      );
    },
  };
}

export function useUpdateCard() {
  const update = useMutation(api.cards.update).withOptimisticUpdate(
    (store, args) => {
      const cards = store.getQuery(api.cards.listByUser, {});
      if (cards === undefined) return;
      store.setQuery(
        api.cards.listByUser,
        {},
        cards.map((c) =>
          c.id === args.id
            ? ({ ...c, front: args.front, back: args.back } as typeof c)
            : c,
        ),
      );
    },
  );
  return {
    mutateAsync: async (input: {
      id: string;
      deckId: string;
      front: string;
      back: string;
    }) => {
      await runMutation(
        "cards",
        update({ id: input.id, front: input.front, back: input.back }),
        "Failed to update card",
      );
    },
  };
}

export function useDeleteCard() {
  const remove = useMutation(api.cards.remove).withOptimisticUpdate(
    (store, args) => {
      const cards = store.getQuery(api.cards.listByUser, {});
      if (cards !== undefined) {
        store.setQuery(
          api.cards.listByUser,
          {},
          cards.filter((c) => c.id !== args.id),
        );
      }
    },
  );
  return {
    mutateAsync: async (input: { id: string; deckId: string }) => {
      await runMutation("cards", remove({ id: input.id }), "Failed to delete card");
    },
  };
}
