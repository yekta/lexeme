import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { useAuth } from "@/hooks/use-auth";
import { DataError } from "@/lib/query-state";
import { commit } from "@/zero/mutate";
import { mutators, queries, type TDeckRow } from "@lexeme/contracts";
import { useZeroStatus } from "@/zero/status";

export type TDeck = TDeckRow;

type DeckInput = {
  name: string;
  description: string;
  learning_profile_id: string;
};

/** Every deck the user owns, newest first. */
export function useDecks() {
  const [rows, details] = useQuery(queries.decks());
  const data = useMemo(
    () => [...rows].sort((a, b) => b.created_at - a.created_at),
    [rows],
  );
  return { data, ...useZeroStatus(data.length > 0, details) };
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
  const zero = useZero();
  const { user } = useAuth();
  return {
    mutateAsync: async (input: DeckInput) => {
      if (!user) throw new Error("Not signed in.");
      // Minted here so the caller can navigate to the deck before the server
      // has heard of it.
      const id = crypto.randomUUID();
      commit(zero.mutate(mutators.deck.create({ id, ...input })), {
        kind: "decks",
        rows: [id],
        message: "Failed to create deck",
      });
      return id;
    },
  };
}

export function useUpdateDeck() {
  const zero = useZero();
  return {
    mutateAsync: async (input: DeckInput & { id: string }) => {
      commit(zero.mutate(mutators.deck.update(input)), {
        kind: "decks",
        rows: [input.id],
        message: "Failed to update deck",
      });
    },
  };
}

export function useDeleteDeck() {
  const zero = useZero();
  return {
    mutateAsync: async (input: { id: string }) => {
      commit(zero.mutate(mutators.deck.delete(input)), {
        kind: "decks",
        rows: [input.id],
        message: "Failed to delete deck",
      });
    },
  };
}
