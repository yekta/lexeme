"use client";

import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { useNow } from "@/components/now-provider";
import { computeStudyBuckets } from "@/lib/study-buckets";
import { usePendingIds } from "@/zero/mutate";
import { queries } from "@/zero/queries";
import type { TCardRow } from "@/zero/schema";
import { zeroStatus } from "@/zero/status";

export type TStudyCard = TCardRow;

export type TStudyQueue = {
  totalCards: number;
  dueCards: TStudyCard[];
};

/**
 * The cards due for study in a deck, derived from the synced rows via
 * `computeStudyBuckets` — the same function behind the deck-list badges, so the
 * queue always contains exactly the cards the badges count. Order is
 * deterministic (new, then learning, then review); the study page shuffles it
 * into a session.
 */
export function useStudyCards(deckId: string | undefined) {
  const [deckCards, cardsDetails] = useQuery(
    deckId ? queries.cardsByDeck({ deck_id: deckId }) : false,
  );
  const [decks, decksDetails] = useQuery(queries.decks());
  const [logs, logsDetails] = useQuery(queries.reviewLogs());
  const [profiles, profilesDetails] = useQuery(queries.learningProfiles());
  const pending = usePendingIds();
  const now = useNow();

  const cards = useMemo(() => deckCards ?? [], [deckCards]);

  const status = zeroStatus(
    cards.length > 0,
    cardsDetails,
    decksDetails,
    logsDetails,
    profilesDetails,
  );

  const data = useMemo<TStudyQueue | undefined>(() => {
    if (status.isPending) return undefined;
    const deck = decks.find((d) => d.id === deckId);
    const buckets = computeStudyBuckets({
      deckCards: [...cards],
      logs: [...logs],
      profile: profiles.find((p) => p.id === deck?.learning_profile_id),
      now,
    });

    return {
      totalCards: cards.length,
      dueCards: [
        ...buckets.newCards,
        ...buckets.learningCards,
        ...buckets.reviewCards,
      ],
    };
  }, [status.isPending, deckId, now, cards, decks, logs, profiles]);

  // True when any card in the deck has a write the server hasn't confirmed —
  // e.g. one just rated this session. Covers the whole deck rather than just
  // `dueCards`, since a rated card leaves the due set.
  const isOptimistic = cards.some((c) => pending.has(c.id));

  return { data, isOptimistic, ...status };
}
