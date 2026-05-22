"use client";

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import {
  cardsCollection,
  decksCollection,
  isRowOptimistic,
  learningProfilesCollection,
  reviewLogsCollection,
  type CardRow,
} from "@/db/collections";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import { SHORT_INTERVAL_MS } from "@/lib/fsrs";

export type TStudyCard = CardRow;

export type TStudyQueue = {
  totalCards: number;
  dueCards: TStudyCard[];
};

/**
 * The cards due for study in a deck, capped by the profile's daily new/review
 * limits — derived live from the collections. Order is deterministic (new,
 * then learning, then review); the study page shuffles it into a session.
 * Replaces the old `cards.getStudyQueue` query.
 */
export function useStudyCards(deckId: string | undefined): {
  data: TStudyQueue | undefined;
  isOptimistic: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} {
  const cardsLq = useLiveQuery(
    (q) =>
      q
        .from({ card: cardsCollection })
        .where(({ card }) => eq(card.deck_id, deckId ?? "")),
    [deckId],
  );
  const decksLq = useLiveQuery((q) => q.from({ deck: decksCollection }));
  const logsLq = useLiveQuery((q) => q.from({ log: reviewLogsCollection }));
  const profilesLq = useLiveQuery((q) =>
    q.from({ profile: learningProfilesCollection }),
  );
  const now = useNow();

  const isError =
    cardsLq.isError ||
    decksLq.isError ||
    logsLq.isError ||
    profilesLq.isError;
  const isReady =
    cardsLq.isReady &&
    decksLq.isReady &&
    logsLq.isReady &&
    profilesLq.isReady;

  const data = useMemo<TStudyQueue | undefined>(() => {
    if (!isReady) return undefined;
    const deckCards = cardsLq.data ?? [];
    const deck = (decksLq.data ?? []).find((d) => d.id === deckId);
    const profile = (profilesLq.data ?? []).find(
      (p) => p.id === deck?.learning_profile_id,
    );
    const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
    const maxReviews =
      profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

    const deckCardIds = new Set(deckCards.map((c) => c.id));
    const newReviewed = new Set<string>();
    const reviewReviewed = new Set<string>();
    for (const log of logsLq.data ?? []) {
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
    cardsLq.data,
    decksLq.data,
    logsLq.data,
    profilesLq.data,
  ]);

  // True when any card in the deck has local mutations the server hasn't
  // confirmed yet — e.g. a card just rated this session. Covers the full deck,
  // not just `dueCards`, since a rated card leaves the due set.
  const isOptimistic = (cardsLq.data ?? []).some(isRowOptimistic);

  return {
    data,
    isOptimistic,
    isPending: !isReady && !isError,
    isError,
    error: isError
      ? (cardsCollection.utils.lastError ??
        decksCollection.utils.lastError ??
        reviewLogsCollection.utils.lastError ??
        learningProfilesCollection.utils.lastError)
      : undefined,
    refetch: () => {
      void cardsCollection.utils.refetch();
      void decksCollection.utils.refetch();
      void reviewLogsCollection.utils.refetch();
      void learningProfilesCollection.utils.refetch();
    },
  };
}
