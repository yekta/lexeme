"use client";

import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type TDeck = RouterOutputs["decks"]["list"][number];
export type TDeckSummary = RouterOutputs["decks"]["get"];

export function useDecks() {
  return api.decks.list.useQuery();
}

export function useDeck(id: string | undefined) {
  return api.decks.get.useQuery({ id: id ?? "" }, { enabled: !!id });
}

export function useCreateDeck() {
  const utils = api.useUtils();
  return api.decks.create.useMutation({
    onSuccess: () => {
      utils.decks.list.invalidate();
      utils.stats.getDeckStats.invalidate();
    },
  });
}

export function useUpdateDeck() {
  const utils = api.useUtils();
  return api.decks.update.useMutation({
    onSuccess: (_data, vars) => {
      utils.decks.list.invalidate();
      utils.decks.get.invalidate({ id: vars.id });
    },
  });
}

export function useDeleteDeck() {
  const utils = api.useUtils();
  return api.decks.delete.useMutation({
    onSuccess: () => {
      utils.decks.list.invalidate();
      utils.stats.getDeckStats.invalidate();
      utils.stats.getToday.invalidate();
    },
  });
}
