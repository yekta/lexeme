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
import { startOfDayMs } from "@/lib/time";

export type TDeckStatsRow = {
  deckId: string;
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: string | null;
  /** A card mutation is in flight (global — Convex has no per-row flag). */
  optimistic: boolean;
};

/**
 * Per-deck card counts (capped by each profile's daily new/review limits),
 * derived live from the card, review-log and profile queries.
 */
export function useDeckStats() {
  const now = useNow();
  const since = startOfDayMs(now);

  const decksQ = useQuery(convexQuery(api.decks.list, {}));
  const cardsQ = useQuery(convexQuery(api.cards.listByUser, {}));
  const logsQ = useQuery(convexQuery(api.reviewLogs.listToday, { since }));
  const profilesQ = useQuery(convexQuery(api.learningProfiles.list, {}));
  const cardsPending = usePendingMutations("cards");

  const data = useMemo<TDeckStatsRow[]>(() => {
    const decks = decksQ.data ?? [];
    const cards = cardsQ.data ?? [];
    const logs = logsQ.data ?? [];
    const profiles = profilesQ.data ?? [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    return decks.map((deck) => {
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      const profile = profileById.get(deck.learning_profile_id);
      const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
      const maxReviews =
        profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

      let newCount = 0;
      let learnCount = 0;
      let dueCount = 0;
      let latest = 0;
      const deckCardIds = new Set<string>();
      for (const c of deckCards) {
        deckCardIds.add(c.id);
        const dueTime = new Date(c.due).getTime();
        if (c.state === "new") newCount++;
        else if (c.state === "learning" || c.state === "relearning") {
          if (dueTime <= now) learnCount++;
        } else if (c.state === "review" && dueTime <= now) dueCount++;
        latest = Math.max(latest, new Date(c.created_at).getTime());
      }

      const newReviewed = new Set<string>();
      const reviewReviewed = new Set<string>();
      for (const log of logs) {
        if (!deckCardIds.has(log.card_id)) continue;
        if (log.state === "new") newReviewed.add(log.card_id);
        else if (log.state === "review") reviewReviewed.add(log.card_id);
      }

      const newLimit = Math.max(0, newPerDay - newReviewed.size);
      const reviewLimit = Math.max(0, maxReviews - reviewReviewed.size);

      return {
        deckId: deck.id,
        total: deckCards.length,
        new: Math.min(newCount, newLimit),
        learn: learnCount,
        due: Math.min(dueCount, reviewLimit),
        latestCardCreatedAt: latest > 0 ? new Date(latest).toISOString() : null,
        optimistic: cardsPending,
      };
    });
  }, [decksQ.data, cardsQ.data, logsQ.data, profilesQ.data, now, cardsPending]);

  const isError =
    decksQ.isError || cardsQ.isError || logsQ.isError || profilesQ.isError;
  const isReady =
    !decksQ.isPending &&
    !cardsQ.isPending &&
    !logsQ.isPending &&
    !profilesQ.isPending;

  return {
    data,
    isPending: !isReady && !isError,
    isError,
    error: isError
      ? (decksQ.error ?? cardsQ.error ?? logsQ.error ?? profilesQ.error)
      : undefined,
    refetch: () => {
      void decksQ.refetch();
      void cardsQ.refetch();
      void logsQ.refetch();
      void profilesQ.refetch();
    },
  };
}

/** Today's review count and time spent, derived live from the review logs. */
export function useTodayStats() {
  const now = useNow();
  const since = startOfDayMs(now);
  const { data, isPending, isError, error, refetch } = useQuery(
    convexQuery(api.reviewLogs.listToday, { since }),
  );
  const stats = useMemo(() => {
    const logs = data ?? [];
    const count = logs.length;
    const totalMs = logs.reduce((sum, l) => sum + l.duration_ms, 0);
    return { count, totalMs, msPerCard: count > 0 ? totalMs / count : 0 };
  }, [data]);
  return { data: stats, isPending, isError, error, refetch };
}
