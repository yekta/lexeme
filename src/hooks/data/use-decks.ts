"use client";

import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { decksCollection, liveStatus, type DeckRow } from "@/db/collections";
import { trackPending } from "@/db/pending-mutations";
import { DataError } from "@/lib/query-state";

export type TDeck = DeckRow;

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
  return {
    mutateAsync: async (input: {
      name: string;
      description: string;
      learning_profile_id: string;
    }) => {
      const id = crypto.randomUUID();
      decksCollection.insert({
        id,
        name: input.name,
        description: input.description,
        learning_profile_id: input.learning_profile_id,
        created_at: new Date(),
      });
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
      decksCollection.update(input.id, (d) => {
        d.name = input.name;
        d.description = input.description;
        d.learning_profile_id = input.learning_profile_id;
      });
    },
  };
}

export function useDeleteDeck() {
  return {
    mutateAsync: async (input: { id: string }) => {
      const tx = decksCollection.delete(input.id);
      trackPending("decks", tx);
    },
  };
}
