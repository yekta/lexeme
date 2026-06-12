"use client";

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import {
  cardsCollection,
  liveStatus,
  newCardRow,
  type CardRow,
} from "@/db/collections";
import { offlineAction } from "@/db/offline";
import { trackPending } from "@/db/pending-mutations";
import { toastOnPersistError } from "@/db/toast-on-error";
import { useAuth } from "@/hooks/use-auth";

export type TCard = CardRow;

const insertCardsAction = offlineAction<CardRow[]>("insertCards", (rows) => {
  cardsCollection.insert(rows);
});

const updateCardAction = offlineAction<{ id: string; front: string; back: string }>(
  "updateCard",
  (v) => {
    cardsCollection.update(v.id, (c) => {
      c.front = v.front;
      c.back = v.back;
    });
  },
);

const deleteCardAction = offlineAction<{ id: string }>("deleteCard", (v) => {
  cardsCollection.delete(v.id);
});

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
  const { user } = useAuth();
  return {
    mutateAsync: async (input: {
      deckId: string;
      front: string;
      back: string;
    }) => {
      if (!user) throw new Error("Not signed in.");
      const id = crypto.randomUUID();
      const tx = insertCardsAction([
        newCardRow({
          id,
          deckId: input.deckId,
          userId: user.id,
          front: input.front,
          back: input.back,
        }),
      ]);
      toastOnPersistError(tx, "Failed to create card");
      return id;
    },
  };
}

/**
 * Bulk-insert cards into a deck. The `insertCards` mutationFn groups by deck
 * and dispatches a single `cards.create` per deck, so this stays one server
 * round-trip regardless of card count.
 */
export function useImportCards() {
  const { user } = useAuth();
  return {
    mutate: (input: {
      deckId: string;
      cards: { front: string; back: string }[];
    }) => {
      if (!user) throw new Error("Not signed in.");
      const rows = input.cards.map((c) =>
        newCardRow({
          id: crypto.randomUUID(),
          deckId: input.deckId,
          userId: user.id,
          front: c.front,
          back: c.back,
        }),
      );
      const tx = insertCardsAction(rows);
      toastOnPersistError(tx, "Failed to import cards");
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
      const tx = updateCardAction(input);
      toastOnPersistError(tx, "Failed to update card");
    },
  };
}

export function useDeleteCard() {
  return {
    mutateAsync: async (input: { id: string; deckId: string }) => {
      const tx = deleteCardAction(input);
      trackPending("cards", tx);
      toastOnPersistError(tx, "Failed to delete card");
    },
  };
}
