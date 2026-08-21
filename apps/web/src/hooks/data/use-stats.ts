import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import {
  computeStudyBuckets,
  computeTrueRetention,
  filterTodayLogs,
} from "@lexeme/shared";
import { usePendingIds } from "@/zero/mutate";
import { queries } from "@lexeme/contracts";
import { useReviewStatus } from "@/zero/status";

export type TDeckStatsRow = {
  deckId: string;
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: string | null;
  /** True retention (0..1), or null when the deck has no review answers yet. */
  retention: number | null;
  /** A card in this deck has local changes the server hasn't confirmed yet. */
  optimistic: boolean;
};

/**
 * Per-deck card counts, derived from the synced rows. Counts come from
 * `computeStudyBuckets`, the same function that builds the study queue, so
 * the badges always equal what the study page offers.
 */
export function useDeckStats() {
  const [decks, decksDetails] = useQuery(queries.decks());
  const [cards, cardsDetails] = useQuery(queries.cards());
  const [logs, logsDetails] = useQuery(queries.reviewLogs());
  const [profiles, profilesDetails] = useQuery(queries.learningProfiles());
  const pending = usePendingIds();
  const now = useNow();

  const data = useMemo<TDeckStatsRow[]>(() => {
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
      for (const c of deckCards) latest = Math.max(latest, c.created_at);

      const deckCardIds = new Set(deckCards.map((c) => c.id));

      return {
        deckId: deck.id,
        total: deckCards.length,
        new: buckets.newCards.length,
        learn: buckets.learningCards.length,
        due: buckets.reviewCards.length,
        latestCardCreatedAt: latest > 0 ? new Date(latest).toISOString() : null,
        retention: computeTrueRetention(logs, deckCardIds, now),
        optimistic: deckCards.some((c) => pending.has(c.id)),
      };
    });
  }, [decks, cards, logs, profiles, pending, now]);

  return {
    data,
    // Reviewed against the review-log pass, not the account one: every number
    // in this row is derived from the history, so publishing it before that
    // history is here means publishing a wrong one.
    ...useReviewStatus(
      logs.length > 0,
      decksDetails,
      cardsDetails,
      logsDetails,
      profilesDetails,
    ),
  };
}

/** Today's study counts and time spent, derived from the review logs. */
export function useTodayStats() {
  const [rows, details] = useQuery(queries.reviewLogs());
  const now = useNow();
  const data = useMemo(() => {
    const logs = filterTodayLogs(rows, now);
    // A card answered twice today is one card studied but two reviews.
    const cardCount = new Set(logs.map((l) => l.card_id)).size;
    const reviewCount = logs.length;
    const totalMs = logs.reduce((sum, l) => sum + l.duration_ms, 0);
    return {
      cardCount,
      reviewCount,
      totalMs,
      msPerCard: cardCount > 0 ? totalMs / cardCount : 0,
      msPerReview: reviewCount > 0 ? totalMs / reviewCount : 0,
    };
  }, [rows, now]);
  return { data, ...useReviewStatus(rows.length > 0, details) };
}
