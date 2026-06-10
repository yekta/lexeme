"use client";

import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";

import { runMutation } from "@/db/mutations";
import { tempId } from "@/db/optimistic";
import { api } from "@/lib/convex-api";
import { DataError } from "@/lib/query-state";
import type { DeckRow } from "@/lib/types";

export type TDeck = DeckRow;

/** Every deck the user owns, newest first (sorted by the backend). */
export function useDecks() {
  const { data, isPending, isError, error, refetch } = useQuery(
    convexQuery(api.decks.list, {}),
  );
  return { data: data ?? [], isPending, isError, error, refetch };
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
  const create = useMutation(api.decks.create).withOptimisticUpdate(
    (store, args) => {
      const decks = store.getQuery(api.decks.list, {});
      if (decks === undefined) return;
      const temp = {
        id: tempId(),
        name: args.name,
        description: args.description,
        learning_profile_id: args.learning_profile_id,
        created_at: Date.now(),
      } as (typeof decks)[number];
      store.setQuery(api.decks.list, {}, [temp, ...decks]);
    },
  );
  return {
    mutateAsync: async (input: {
      name: string;
      description: string;
      learning_profile_id: string;
    }) => {
      const id = await runMutation(
        "decks",
        create(input),
        "Failed to create deck",
      );
      return id as string;
    },
  };
}

export function useUpdateDeck() {
  const update = useMutation(api.decks.update).withOptimisticUpdate(
    (store, args) => {
      const decks = store.getQuery(api.decks.list, {});
      if (decks === undefined) return;
      store.setQuery(
        api.decks.list,
        {},
        decks.map((d) =>
          d.id === args.id
            ? ({
                ...d,
                name: args.name,
                description: args.description,
                learning_profile_id: args.learning_profile_id,
              } as typeof d)
            : d,
        ),
      );
    },
  );
  return {
    mutateAsync: async (input: {
      id: string;
      name: string;
      description: string;
      learning_profile_id: string;
    }) => {
      await runMutation("decks", update(input), "Failed to update deck");
    },
  };
}

export function useDeleteDeck() {
  const remove = useMutation(api.decks.remove).withOptimisticUpdate(
    (store, args) => {
      const decks = store.getQuery(api.decks.list, {});
      if (decks !== undefined) {
        store.setQuery(
          api.decks.list,
          {},
          decks.filter((d) => d.id !== args.id),
        );
      }
      const cards = store.getQuery(api.cards.listByUser, {});
      if (cards !== undefined) {
        store.setQuery(
          api.cards.listByUser,
          {},
          cards.filter((c) => c.deck_id !== args.id),
        );
      }
    },
  );
  return {
    mutateAsync: async (input: { id: string }) => {
      await runMutation("decks", remove(input), "Failed to delete deck");
    },
  };
}
