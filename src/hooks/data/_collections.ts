import { useLiveQuery } from "@tanstack/react-db";
import { getCollections } from "@/lib/collections";
import type {
  TCardContentRow,
  TCardRow,
  TDeckRow,
  TLearningProfileRow,
  TReviewLogRow,
} from "@/lib/db-types";

/**
 * Raw, reactive reads of each collection.
 *
 * Every collection is local (OPFS SQLite), so these queries are sub-millisecond
 * — higher-level hooks just filter / join / aggregate the results in plain JS.
 */

export function useAllDecks() {
  const { data, isLoading } = useLiveQuery((q) =>
    q.from({ row: getCollections().decks }),
  );
  return { rows: (data ?? []) as unknown as TDeckRow[], isLoading };
}

export function useAllCards() {
  const { data, isLoading } = useLiveQuery((q) =>
    q.from({ row: getCollections().cards }),
  );
  return { rows: (data ?? []) as unknown as TCardRow[], isLoading };
}

export function useAllCardContents() {
  const { data, isLoading } = useLiveQuery((q) =>
    q.from({ row: getCollections().cardContents }),
  );
  return { rows: (data ?? []) as unknown as TCardContentRow[], isLoading };
}

export function useAllLearningProfiles() {
  const { data, isLoading } = useLiveQuery((q) =>
    q.from({ row: getCollections().learningProfiles }),
  );
  return { rows: (data ?? []) as unknown as TLearningProfileRow[], isLoading };
}

export function useAllReviewLogs() {
  const { data, isLoading } = useLiveQuery((q) =>
    q.from({ row: getCollections().reviewLogs }),
  );
  return { rows: (data ?? []) as unknown as TReviewLogRow[], isLoading };
}

/** Local start-of-day, used for daily review limits and "today" stats. */
export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
