"use client";

import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { decksCollection, liveStatus, type DeckRow } from "@/db/collections";
import { offlineAction } from "@/db/offline";
import { trackPending } from "@/db/pending-mutations";
import { toastOnPersistError } from "@/db/toast-on-error";
import { useAuth } from "@/hooks/use-auth";
import { DataError } from "@/lib/query-state";

export type TDeck = DeckRow;

type DeckInput = {
  id: string;
  name: string;
  description: string;
  learning_profile_id: string;
};

const createDeckAction = offlineAction<DeckInput & { user_id: string }>(
  "createDeck",
  (v) => {
    const now = new Date();
    decksCollection.insert({
      id: v.id,
      user_id: v.user_id,
      name: v.name,
      description: v.description,
      learning_profile_id: v.learning_profile_id,
      created_at: now,
      updated_at: now,
    });
  },
);

const updateDeckAction = offlineAction<DeckInput>("updateDeck", (v) => {
  decksCollection.update(v.id, (d) => {
    d.name = v.name;
    d.description = v.description;
    d.learning_profile_id = v.learning_profile_id;
  });
});

const deleteDeckAction = offlineAction<{ id: string }>("deleteDeck", (v) => {
  decksCollection.delete(v.id);
});

/** Every deck the user owns, newest first. */
export function useDecks() {
  const lq = useLiveQuery((q) => q.from({ deck: decksCollection }));
  const data = useMemo(
    () =>
      [...(lq.data ?? [])].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [lq.data],
  );
  return { data, ...liveStatus(lq, decksCollection) };
}

/** A single deck by id. Resolves to a NOT_FOUND state once loaded and absent. */
export function useDeck(id: string | undefined) {
  const { data: decks, isPending, isError, error, refetch } = useDecks();
  const deck = id ? decks.find((d) => d.id === id) : undefined;
  const notFound = !isPending && !isError && id !== undefined && !deck;
  return {
    data: deck,
    isPending: isPending || id === undefined,
    isError: isError || notFound,
    error: notFound ? new DataError("NOT_FOUND") : error,
    refetch,
  };
}

export function useCreateDeck() {
  const { user } = useAuth();
  return {
    mutateAsync: async (input: {
      name: string;
      description: string;
      learning_profile_id: string;
    }) => {
      if (!user) throw new Error("Not signed in.");
      const id = crypto.randomUUID();
      const tx = createDeckAction({ id, user_id: user.id, ...input });
      toastOnPersistError(tx, "Failed to create deck");
      return id;
    },
  };
}

export function useUpdateDeck() {
  return {
    mutateAsync: async (input: {
      id: string;
      name: string;
      description: string;
      learning_profile_id: string;
    }) => {
      const tx = updateDeckAction(input);
      toastOnPersistError(tx, "Failed to update deck");
    },
  };
}

export function useDeleteDeck() {
  return {
    mutateAsync: async (input: { id: string }) => {
      const tx = deleteDeckAction(input);
      trackPending("decks", tx);
      toastOnPersistError(tx, "Failed to delete deck");
    },
  };
}
