"use client";

import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type TCard = RouterOutputs["cards"]["list"][number];

export function useCardsByDeck(deckId: string | undefined) {
  return api.cards.list.useQuery(
    { deckId: deckId ?? "" },
    { enabled: !!deckId },
  );
}

export function useCreateCard() {
  const utils = api.useUtils();
  return api.cards.create.useMutation({
    onSuccess: async (_data, vars) => {
      await utils.cards.list.refetch({ deckId: vars.deckId });
      utils.cards.getStudyQueue.invalidate({ deckId: vars.deckId });
      utils.stats.getDeckStats.invalidate();
    },
  });
}

export function useUpdateCard() {
  const utils = api.useUtils();
  return api.cards.update.useMutation({
    onSuccess: async (_data, vars) => {
      await utils.cards.list.refetch({ deckId: vars.deckId });
      utils.cards.getStudyQueue.invalidate({ deckId: vars.deckId });
    },
  });
}

export function useDeleteCard() {
  const utils = api.useUtils();
  return api.cards.delete.useMutation({
    onSuccess: async (_data, vars) => {
      await utils.cards.list.refetch({ deckId: vars.deckId });
      utils.cards.getStudyQueue.invalidate({ deckId: vars.deckId });
      utils.stats.getDeckStats.invalidate();
    },
  });
}
