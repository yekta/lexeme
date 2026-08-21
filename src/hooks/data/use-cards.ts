"use client";

import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { commit } from "@/zero/mutate";
import { mutators } from "@/zero/mutators";
import { queries } from "@/zero/queries";
import type { TCardRow } from "@/zero/schema";
import { zeroStatus } from "@/zero/status";

export type TCard = TCardRow;

/** Cards in a deck, newest first. */
export function useCardsByDeck(deckId: string | undefined) {
  const [rows, details] = useQuery(
    deckId ? queries.cardsByDeck({ deck_id: deckId }) : false,
  );
  const data = useMemo(
    () => [...(rows ?? [])].sort((a, b) => b.created_at - a.created_at),
    [rows],
  );
  return { data, ...zeroStatus(data.length > 0, details) };
}

export function useCreateCard() {
  const zero = useZero();
  return {
    mutateAsync: async (input: {
      deckId: string;
      front: string;
      back: string;
    }) => {
      const id = crypto.randomUUID();
      commit(
        zero.mutate(
          mutators.card.insert({
            deck_id: input.deckId,
            cards: [{ id, front: input.front, back: input.back }],
          }),
        ),
        { kind: "cards", rows: [id], message: "Failed to create card" },
      );
      return id;
    },
  };
}

/**
 * Bulk-insert cards into a deck. One mutation regardless of card count, so a
 * paste of five hundred cards is a single optimistic write and a single trip to
 * the server.
 */
export function useImportCards() {
  const zero = useZero();
  return {
    mutate: (input: {
      deckId: string;
      cards: { front: string; back: string }[];
    }) => {
      const cards = input.cards.map((c) => ({
        id: crypto.randomUUID(),
        front: c.front,
        back: c.back,
      }));
      commit(
        zero.mutate(
          mutators.card.insert({ deck_id: input.deckId, cards }),
        ),
        {
          kind: "cards",
          rows: cards.map((c) => c.id),
          message: "Failed to import cards",
        },
      );
    },
  };
}

export function useUpdateCard() {
  const zero = useZero();
  return {
    mutateAsync: async (input: { id: string; front: string; back: string }) => {
      commit(zero.mutate(mutators.card.update(input)), {
        kind: "cards",
        rows: [input.id],
        message: "Failed to update card",
      });
    },
  };
}

export function useDeleteCard() {
  const zero = useZero();
  return {
    mutateAsync: async (input: { id: string }) => {
      commit(zero.mutate(mutators.card.delete({ id: input.id })), {
        kind: "cards",
        rows: [input.id],
        message: "Failed to delete card",
      });
    },
  };
}
