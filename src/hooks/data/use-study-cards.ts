"use client";

import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import { usePendingMutations } from "@/db/pending-mutations";
import { api } from "@/lib/convex-api";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import { SHORT_INTERVAL_MS } from "@/lib/fsrs";
import { startOfDayMs } from "@/lib/time";
import type { CardRow } from "@/lib/types";

export type TStudyCard = CardRow;

export type TStudyQueue = {
  totalCards: number;
  dueCards: TStudyCard[];
};

/**
 * The cards due for study in a deck, capped by the profile's daily new/review
 * limits — derived live from the Convex queries. Order is deterministic (new,
 * then learning, then review); the study page shuffles it into a session.
 */
export function useStudyCards(deckId: string | undefined): {
  data: TStudyQueue | undefined;
  isOptimistic: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const now = useNow();
  const since = startOfDayMs(now);

  const cardsQ = useQuery(convexQuery(api.cards.listByUser, {}));
  const decksQ = useQuery(convexQuery(api.decks.list, {}));
  const logsQ = useQuery(convexQuery(api.reviewLogs.listToday, { since }));
  const profilesQ = useQuery(convexQuery(api.learningProfiles.list, {}));

  const isError =
    cardsQ.isError || decksQ.isError || logsQ.isError || profilesQ.isError;
  const isReady =
    !cardsQ.isPending &&
    !decksQ.isPending &&
    !logsQ.isPending &&
    !profilesQ.isPending;

  const data = useMemo<TStudyQueue | undefined>(() => {
    if (!isReady) return undefined;
    const deckCards = (cardsQ.data ?? []).filter((c) => c.deck_id === deckId);
    const deck = (decksQ.data ?? []).find((d) => d.id === deckId);
    const profile = (profilesQ.data ?? []).find(
      (p) => p.id === deck?.learning_profile_id,
    );
    const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
    const maxReviews =
      profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

    const deckCardIds = new Set(deckCards.map((c) => c.id));
    const newReviewed = new Set<string>();
    const reviewReviewed = new Set<string>();
    for (const log of logsQ.data ?? []) {
      if (!deckCardIds.has(log.card_id)) continue;
      if (log.state === "new") newReviewed.add(log.card_id);
      else if (log.state === "review") reviewReviewed.add(log.card_id);
    }

    // Cards due within the short-interval window are studyable this session.
    const soonCutoff = now + SHORT_INTERVAL_MS;
    const dueRows = deckCards.filter(
      (c) => new Date(c.due).getTime() <= soonCutoff,
    );
    const newCards = dueRows.filter((c) => c.state === "new");
    const reviewCards = dueRows.filter((c) => c.state === "review");
    const learningCards = dueRows.filter(
      (c) => c.state === "learning" || c.state === "relearning",
    );

    const newLimit = Math.max(0, newPerDay - newReviewed.size);
    const reviewLimit = Math.max(0, maxReviews - reviewReviewed.size);

    return {
      totalCards: deckCards.length,
      dueCards: [
        ...newCards.slice(0, newLimit),
        ...learningCards,
        ...reviewCards.slice(0, reviewLimit),
      ],
    };
  }, [
    isReady,
    deckId,
    now,
    cardsQ.data,
    decksQ.data,
    logsQ.data,
    profilesQ.data,
  ]);

  const isOptimistic = usePendingMutations("cards");

  return {
    data,
    isOptimistic,
    isPending: !isReady && !isError,
    isError,
    error: isError
      ? (cardsQ.error ?? decksQ.error ?? logsQ.error ?? profilesQ.error)
      : undefined,
    refetch: () => {
      void cardsQ.refetch();
      void decksQ.refetch();
      void logsQ.refetch();
      void profilesQ.refetch();
    },
  };
}
