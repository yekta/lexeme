"use client";

import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import {
  cardsCollection,
  decksCollection,
  learningProfilesCollection,
  reviewLogsCollection,
  isRowOptimistic,
  liveStatus,
} from "@/db/collections";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";

export type TDeckStatsRow = {
  deckId: string;
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: string | null;
  /** A card in this deck has local changes the server hasn't confirmed yet. */
  optimistic: boolean;
};

/**
 * Per-deck card counts (capped by each profile's daily new/review limits),
 * derived live from the card, review-log and profile collections. Replaces the
 * old `stats.getDeckStats` aggregation query.
 */
export function useDeckStats() {
  const decksLq = useLiveQuery((q) => q.from({ deck: decksCollection }));
  const cardsLq = useLiveQuery((q) => q.from({ card: cardsCollection }));
  const logsLq = useLiveQuery((q) => q.from({ log: reviewLogsCollection }));
  const profilesLq = useLiveQuery((q) =>
    q.from({ profile: learningProfilesCollection }),
  );
  const now = useNow();

  const data = useMemo<TDeckStatsRow[]>(() => {
    const decks = decksLq.data ?? [];
    const cards = cardsLq.data ?? [];
    const logs = logsLq.data ?? [];
    const profiles = profilesLq.data ?? [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    // Anki-style deck counts: a learning/review card counts toward "learn"/"due"
    // if it's due any time today (or overdue) — not only if it's already past
    // due this instant. A new card rated "Good" lands in learning due ~10 min
    // out; it should still show as a learning card, not vanish from every
    // bucket. Mirrors Anki's deck list (the study screen separately gates what's
    // studyable right now via the short-interval learn-ahead window).
    const endOfToday = new Date(now);
    endOfToday.setHours(24, 0, 0, 0);
    const dayEnd = endOfToday.getTime();

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
          if (dueTime < dayEnd) learnCount++;
        } else if (c.state === "review" && dueTime < dayEnd) dueCount++;
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
        optimistic: deckCards.some(isRowOptimistic),
      };
    });
  }, [decksLq.data, cardsLq.data, logsLq.data, profilesLq.data, now]);

  const isError =
    decksLq.isError ||
    cardsLq.isError ||
    logsLq.isError ||
    profilesLq.isError;
  const isReady =
    decksLq.isReady &&
    cardsLq.isReady &&
    logsLq.isReady &&
    profilesLq.isReady;

  return {
    data,
    isPending: !isReady && !isError,
    isError,
    error: isError
      ? (decksCollection.utils.lastError ??
        cardsCollection.utils.lastError ??
        reviewLogsCollection.utils.lastError ??
        learningProfilesCollection.utils.lastError)
      : undefined,
    refetch: () => {
      void decksCollection.utils.refetch();
      void cardsCollection.utils.refetch();
      void reviewLogsCollection.utils.refetch();
      void learningProfilesCollection.utils.refetch();
    },
  };
}

/** Today's review count and time spent, derived live from the review logs. */
export function useTodayStats() {
  const lq = useLiveQuery((q) => q.from({ log: reviewLogsCollection }));
  const data = useMemo(() => {
    const logs = lq.data ?? [];
    const count = logs.length;
    const totalMs = logs.reduce((sum, l) => sum + l.duration_ms, 0);
    return { count, totalMs, msPerCard: count > 0 ? totalMs / count : 0 };
  }, [lq.data]);
  return { data, ...liveStatus(lq, reviewLogsCollection) };
}
