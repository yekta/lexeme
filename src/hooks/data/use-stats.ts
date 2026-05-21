import { useMemo } from "react";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import {
  startOfToday,
  useAllCards,
  useAllDecks,
  useAllLearningProfiles,
  useAllReviewLogs,
} from "./_collections";

export type TDeckStatsRow = {
  deckId: string;
  total: number;
  new: number;
  learn: number;
  due: number;
  latestCardCreatedAt: string | null;
};

/** Total cards reviewed today + time spent — derived live from review_logs. */
export function useTodayStats() {
  const { rows: logs, isLoading } = useAllReviewLogs();
  const data = useMemo(() => {
    const start = startOfToday();
    const today = logs.filter((l) => new Date(l.review).getTime() >= start);
    const count = today.length;
    const totalMs = today.reduce((sum, l) => sum + l.duration_ms, 0);
    return { count, totalMs, msPerCard: count > 0 ? totalMs / count : 0 };
  }, [logs]);
  return { data, isPending: isLoading };
}

/** Per-deck counts (total / new / learn / due) honouring daily limits. */
export function useDeckStats() {
  const { rows: decks, isLoading: l1 } = useAllDecks();
  const { rows: cards, isLoading: l2 } = useAllCards();
  const { rows: profiles, isLoading: l3 } = useAllLearningProfiles();
  const { rows: logs, isLoading: l4 } = useAllReviewLogs();

  const data = useMemo<TDeckStatsRow[]>(() => {
    const now = Date.now();
    const start = startOfToday();
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const cardDeck = new Map(cards.map((c) => [c.id, c.deck_id]));

    const newReviewed = new Map<string, Set<string>>();
    const reviewReviewed = new Map<string, Set<string>>();
    for (const log of logs) {
      if (new Date(log.review).getTime() < start) continue;
      const deckId = cardDeck.get(log.card_id);
      if (!deckId) continue;
      const bucket = log.state === "new" ? newReviewed : log.state === "review" ? reviewReviewed : null;
      if (!bucket) continue;
      const set = bucket.get(deckId) ?? new Set<string>();
      set.add(log.card_id);
      bucket.set(deckId, set);
    }

    return decks.map((deck) => {
      const profile = profileById.get(deck.learning_profile_id);
      const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
      const maxReviews =
        profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

      let total = 0;
      let newCount = 0;
      let learnCount = 0;
      let dueCount = 0;
      let latest: string | null = null;
      for (const c of cards) {
        if (c.deck_id !== deck.id) continue;
        total++;
        const dueMs = new Date(c.due).getTime();
        if (c.state === "new") newCount++;
        else if (
          (c.state === "learning" || c.state === "relearning") &&
          dueMs <= now
        )
          learnCount++;
        else if (c.state === "review" && dueMs <= now) dueCount++;
        if (!latest || c.created_at > latest) latest = c.created_at;
      }

      const newLimit = Math.max(
        0,
        newPerDay - (newReviewed.get(deck.id)?.size ?? 0),
      );
      const reviewLimit = Math.max(
        0,
        maxReviews - (reviewReviewed.get(deck.id)?.size ?? 0),
      );
      return {
        deckId: deck.id,
        total,
        new: Math.min(newCount, newLimit),
        learn: learnCount,
        due: Math.min(dueCount, reviewLimit),
        latestCardCreatedAt: latest,
      };
    });
  }, [decks, cards, profiles, logs]);

  return { data, isPending: l1 || l2 || l3 || l4 };
}
