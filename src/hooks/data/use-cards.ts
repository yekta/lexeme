"use client";

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import {
  cardsCollection,
  liveStatus,
  newCardRow,
  type CardRow,
} from "@/db/collections";
import { trackPending } from "@/db/pending-mutations";
import { toastOnPersistError } from "@/db/toast-on-error";

export type TCard = CardRow;

/** Cards in a deck, newest first. */
export function useCardsByDeck(deckId: string | undefined) {
  const lq = useLiveQuery(
    (q) =>
      q
        .from({ card: cardsCollection })
        .where(({ card }) => eq(card.deck_id, deckId ?? "")),
    [deckId],
  );
  const data = useMemo(
    () =>
      [...(lq.data ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [lq.data],
  );
  return { data, ...liveStatus(lq, cardsCollection) };
}

export function useCreateCard() {
  return {
    mutateAsync: async (input: {
      deckId: string;
      front: string;
      back: string;
    }) => {
      const id = crypto.randomUUID();
      const tx = cardsCollection.insert(
        newCardRow({
          id,
          deckId: input.deckId,
          front: input.front,
          back: input.back,
        }),
      );
      toastOnPersistError(tx, "Failed to create card");
      return id;
    },
  };
}

export function useUpdateCard() {
  return {
    mutateAsync: async (input: {
      id: string;
      deckId: string;
      front: string;
      back: string;
    }) => {
      const tx = cardsCollection.update(input.id, (c) => {
        c.front = input.front;
        c.back = input.back;
      });
      toastOnPersistError(tx, "Failed to update card");
    },
  };
}

export function useDeleteCard() {
  return {
    mutateAsync: async (input: { id: string; deckId: string }) => {
      const tx = cardsCollection.delete(input.id);
      trackPending("cards", tx);
      toastOnPersistError(tx, "Failed to delete card");
    },
  };
}
