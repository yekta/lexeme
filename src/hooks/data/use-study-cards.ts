"use client";

import { api } from "@/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/api/root";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type TStudyCard =
  RouterOutputs["cards"]["getStudyQueue"]["dueCards"][number];

export function useStudyCards(deckId: string | undefined) {
  return api.cards.getStudyQueue.useQuery(
    { deckId: deckId ?? "" },
    { enabled: !!deckId, staleTime: 0, gcTime: 0 },
  );
}
