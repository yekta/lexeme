"use client";

import { eq, useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import {
  cardsCollection,
  decksCollection,
  isRowOptimistic,
  learningProfilesCollection,
  restartCollections,
  reviewLogsCollection,
  type CardRow,
} from "@/db/collections";
import { computeStudyBuckets } from "@/lib/study-buckets";

export type TStudyCard = CardRow;

export type TStudyQueue = {
  totalCards: number;
  dueCards: TStudyCard[];
};

/**
 * The cards due for study in a deck, derived live from the collections via
 * `computeStudyBuckets` — the same function behind the deck-list badges, so
 * the queue always contains exactly the cards the badges count. Order is
 * deterministic (new, then learning, then review); the study page shuffles it
 * into a session. Replaces the old `cards.getStudyQueue` query.
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
    const buckets = computeStudyBuckets({
      deckCards,
      logs: logsLq.data ?? [],
      profile,
      now,
    });

    return {
      totalCards: deckCards.length,
      dueCards: [
        ...buckets.newCards,
        ...buckets.learningCards,
        ...buckets.reviewCards,
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
      ? new Error("Syncing failed. Check your connection and retry.")
      : undefined,
    refetch: () => {
      restartCollections([
        cardsCollection,
        decksCollection,
        reviewLogsCollection,
        learningProfilesCollection,
      ]);
    },
  };
}
