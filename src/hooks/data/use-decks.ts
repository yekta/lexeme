import { useMemo } from "react";
import { getCollections } from "@/lib/collections";
import type { TDeckRow } from "@/lib/db-types";
import { getCurrentUserId } from "@/lib/session-store";
import { asMutation } from "./_mutation";
import { useAllDecks } from "./_collections";

export type TDeck = TDeckRow;
export type TDeckSummary = TDeckRow;

function byCreatedDesc(a: TDeckRow, b: TDeckRow): number {
  return b.created_at.localeCompare(a.created_at);
}

export function useDecks() {
  const { rows, isLoading } = useAllDecks();
  const data = useMemo(() => [...rows].sort(byCreatedDesc), [rows]);
  return { data, isPending: isLoading };
}

export function useDeck(id: string | undefined) {
  const { rows, isLoading } = useAllDecks();
  const data = useMemo(
    () => (id ? (rows.find((d) => d.id === id) ?? null) : null),
    [rows, id],
  );
  return { data, isPending: isLoading };
}

type CreateDeckInput = {
  name: string;
  description: string;
  learning_profile_id: string;
};

export function useCreateDeck() {
  return asMutation<CreateDeckInput, string>((input) => {
    const now = new Date().toISOString();
    const row: TDeckRow = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      name: input.name,
      description: input.description,
      learning_profile_id: input.learning_profile_id,
      created_at: now,
      updated_at: now,
    };
    getCollections().decks.insert(row);
    return row.id;
  });
}

type UpdateDeckInput = {
  id: string;
  name: string;
  description: string;
  learning_profile_id: string;
};

export function useUpdateDeck() {
  return asMutation<UpdateDeckInput, void>((input) => {
    getCollections().decks.update(input.id, (draft) => {
      draft.name = input.name;
      draft.description = input.description;
      draft.learning_profile_id = input.learning_profile_id;
      draft.updated_at = new Date().toISOString();
    });
  });
}

export function useDeleteDeck() {
  return asMutation<{ id: string }, void>((input) => {
    getCollections().decks.delete(input.id);
  });
}
