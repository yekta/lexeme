"use client";

import { api } from "@/trpc/react";

export function useRateCard(deckId: string | undefined) {
  const utils = api.useUtils();
  return api.cards.rate.useMutation({
    onSuccess: () => {
      utils.stats.getToday.invalidate();
      utils.stats.getDeckStats.invalidate();
      if (deckId) utils.cards.list.invalidate({ deckId });
      // Don't invalidate studyQueue — the study page owns its in-memory queue
      // for the active session; re-fetching would disrupt it.
    },
  });
}
