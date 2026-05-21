import { useMemo } from "react";
import { rateCardAction } from "@/lib/actions";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import type { TCardRow, TLearningProfileRow } from "@/lib/db-types";
import { applyRating, SHORT_INTERVAL_MS, type Grade } from "@/lib/fsrs";
import { getCurrentUserId } from "@/lib/session-store";
import {
  startOfToday,
  useAllCardContents,
  useAllCards,
  useAllDecks,
  useAllLearningProfiles,
  useAllReviewLogs,
} from "./_collections";

/** A due card with its content, ready to study. */
export type TStudyCard = TCardRow & { front: string; back: string };

export type TStudyData = { totalCards: number; dueCards: TStudyCard[] };

/**
 * Build the study queue for a deck, entirely from local collections:
 * due cards within the short-interval window, capped by the profile's daily
 * new/review limits (using today's review logs), then shuffled.
 */
export function useStudyCards(deckId: string | undefined) {
  const { rows: cards, isLoading: l1 } = useAllCards();
  const { rows: contents, isLoading: l2 } = useAllCardContents();
  const { rows: decks, isLoading: l3 } = useAllDecks();
  const { rows: profiles, isLoading: l4 } = useAllLearningProfiles();
  const { rows: logs, isLoading: l5 } = useAllReviewLogs();
  const isPending = l1 || l2 || l3 || l4 || l5;

  const data = useMemo<TStudyData | undefined>(() => {
    if (!deckId || isPending) return undefined;
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return { totalCards: 0, dueCards: [] };

    const profile = profiles.find((p) => p.id === deck.learning_profile_id);
    const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
    const maxReviews =
      profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

    const deckCards = cards.filter((c) => c.deck_id === deckId);
    const contentByCard = new Map(contents.map((c) => [c.card_id, c]));
    const soonCutoff = Date.now() + SHORT_INTERVAL_MS;

    const dueRows = deckCards
      .filter((c) => new Date(c.due).getTime() <= soonCutoff)
      .map((c): TStudyCard | null => {
        const content = contentByCard.get(c.id);
        return content
          ? { ...c, front: content.front, back: content.back }
          : null;
      })
      .filter((c): c is TStudyCard => c !== null);

    const start = startOfToday();
    const deckCardIds = new Set(deckCards.map((c) => c.id));
    const newReviewed = new Set<string>();
    const reviewReviewed = new Set<string>();
    for (const log of logs) {
      if (!deckCardIds.has(log.card_id)) continue;
      if (new Date(log.review).getTime() < start) continue;
      if (log.state === "new") newReviewed.add(log.card_id);
      else if (log.state === "review") reviewReviewed.add(log.card_id);
    }

    const newCards = dueRows.filter((c) => c.state === "new");
    const reviewCards = dueRows.filter((c) => c.state === "review");
    const learningCards = dueRows.filter(
      (c) => c.state === "learning" || c.state === "relearning",
    );
    const newLimit = Math.max(0, newPerDay - newReviewed.size);
    const reviewLimit = Math.max(0, maxReviews - reviewReviewed.size);

    const limited = [
      ...newCards.slice(0, newLimit),
      ...learningCards,
      ...reviewCards.slice(0, reviewLimit),
    ];
    // Fisher–Yates shuffle.
    for (let i = limited.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [limited[i], limited[j]] = [limited[j]!, limited[i]!];
    }

    return { totalCards: deckCards.length, dueCards: limited };
  }, [cards, contents, decks, profiles, logs, deckId, isPending]);

  return { data, isPending };
}

/**
 * Returns a function that rates a card: it runs FSRS locally, writes the new
 * card state + review log optimistically, and returns the result so the study
 * session can decide whether to re-queue the card.
 */
export function useRateCard() {
  return (opts: {
    card: TStudyCard;
    profile: TLearningProfileRow;
    rating: Grade;
    durationMs: number;
  }): { intervalMs: number; updatedCard: TStudyCard } => {
    const { card, log, intervalMs } = applyRating({
      card: opts.card,
      profile: opts.profile,
      rating: opts.rating,
      durationMs: opts.durationMs,
      userId: getCurrentUserId(),
    });
    rateCardAction({ card, log });
    return {
      intervalMs,
      updatedCard: { ...card, front: opts.card.front, back: opts.card.back },
    };
  };
}
