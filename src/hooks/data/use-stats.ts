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
  restartCollections,
} from "@/db/collections";
import { computeStudyBuckets, filterTodayLogs } from "@/lib/study-buckets";

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
 * Per-deck card counts, derived live from the card, review-log and profile
 * collections. Counts come from `computeStudyBuckets` — the same function that
 * builds the study queue — so the badges always equal what the study page
 * offers. Replaces the old `stats.getDeckStats` aggregation query.
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

    return decks.map((deck) => {
      const deckCards = cards.filter((c) => c.deck_id === deck.id);
      const buckets = computeStudyBuckets({
        deckCards,
        logs,
        profile: profileById.get(deck.learning_profile_id),
        now,
      });

      let latest = 0;
      for (const c of deckCards) {
        latest = Math.max(latest, new Date(c.created_at).getTime());
      }

      return {
        deckId: deck.id,
        total: deckCards.length,
        new: buckets.newCards.length,
        learn: buckets.learningCards.length,
        due: buckets.reviewCards.length,
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
      ? new Error("Syncing failed. Check your connection and retry.")
      : undefined,
    refetch: () => {
      restartCollections([
        decksCollection,
        cardsCollection,
        reviewLogsCollection,
        learningProfilesCollection,
      ]);
    },
  };
}

/** Today's review count and time spent, derived live from the review logs. */
export function useTodayStats() {
  const lq = useLiveQuery((q) => q.from({ log: reviewLogsCollection }));
  const now = useNow();
  const data = useMemo(() => {
    const logs = filterTodayLogs(lq.data ?? [], now);
    const count = logs.length;
    const totalMs = logs.reduce((sum, l) => sum + l.duration_ms, 0);
    return { count, totalMs, msPerCard: count > 0 ? totalMs / count : 0 };
  }, [lq.data, now]);
  return { data, ...liveStatus(lq, reviewLogsCollection) };
}
