"use client";

import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type TCard = RouterOutputs["cards"]["get"][number];

export function useCardsByDeck(deckId: string | undefined) {
  return api.cards.get.useQuery(
    { deckId: deckId ?? "" },
    { enabled: !!deckId },
  );
}

export function useCreateCard() {
  const utils = api.useUtils();
  return api.cards.create.useMutation({
    onSuccess: (_data, vars) => {
      utils.cards.get.invalidate({ deckId: vars.deckId });
      utils.cards.studyQueue.invalidate({ deckId: vars.deckId });
      utils.stats.getDeckStats.invalidate();
    },
  });
}

export function useUpdateCard() {
  const utils = api.useUtils();
  return api.cards.update.useMutation({
    onSuccess: (_data, vars) => {
      utils.cards.get.invalidate({ deckId: vars.deckId });
      utils.cards.studyQueue.invalidate({ deckId: vars.deckId });
    },
  });
}

export function useDeleteCard() {
  const utils = api.useUtils();
  return api.cards.delete.useMutation({
    onSuccess: (_data, vars) => {
      utils.cards.get.invalidate({ deckId: vars.deckId });
      utils.cards.studyQueue.invalidate({ deckId: vars.deckId });
      utils.stats.getDeckStats.invalidate();
    },
  });
}
