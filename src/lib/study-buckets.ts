import type {
  CardRow,
  LearningProfileRow,
  ReviewLogRow,
} from "@/db/collections";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import { SHORT_INTERVAL_MS } from "@/lib/fsrs";

export type StudyBuckets = {
  newCards: CardRow[];
  learningCards: CardRow[];
  reviewCards: CardRow[];
};

/**
 * The review logs written since the start of today (local time). The synced
 * review-log collection holds the full history, but daily limits and today's
 * stats only care about today's entries.
 */
export function filterTodayLogs(
  logs: ReviewLogRow[],
  now: number,
): ReviewLogRow[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayStart = startOfToday.getTime();
  return logs.filter((log) => new Date(log.review).getTime() >= dayStart);
}

const RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function computeTrueRetention(
  logs: ReviewLogRow[],
  deckCardIds: Set<string>,
  now: number,
): number | null {
  const cutoff = now - RETENTION_WINDOW_MS;
  let recentPassed = 0;
  let recentTotal = 0;
  let allPassed = 0;
  let allTotal = 0;
  for (const log of logs) {
    if (log.state !== "review") continue;
    if (log.rating < 1) continue;
    if (!deckCardIds.has(log.card_id)) continue;
    const passed = log.rating > 1;
    allTotal++;
    if (passed) allPassed++;
    if (new Date(log.review).getTime() >= cutoff) {
      recentTotal++;
      if (passed) recentPassed++;
    }
  }
  if (recentTotal > 0) return recentPassed / recentTotal;
  if (allTotal > 0) return allPassed / allTotal;
  return null;
}

/**
 * The single source of truth for what is studyable in a deck right now. The
 * deck-list badges (`useDeckStats`) and the study queue (`useStudyCards`) both
 * derive from this, so a non-zero badge count always means the study page has
 * exactly those cards — they can never disagree.
 *
 * Bucket rules:
 * - `new`: always ready, capped by the profile's remaining daily new limit.
 * - `learning`/`relearning`: due within the learn-ahead window
 *   (`SHORT_INTERVAL_MS`), mirroring Anki's learn-ahead behaviour.
 * - `review`: due any time today (FSRS stamps `due` with the time of the last
 *   review, so day granularity keeps reviews from drifting later every day),
 *   capped by the remaining daily review limit.
 */
export function computeStudyBuckets({
  deckCards,
  logs,
  profile,
  now,
}: {
  deckCards: CardRow[];
  /** Review logs from any deck or day — filtered to `deckCards` and today internally. */
  logs: ReviewLogRow[];
  profile: LearningProfileRow | undefined;
  now: number;
}): StudyBuckets {
  const newPerDay = profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
  const maxReviews =
    profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

  // Cards already studied today count against the daily limits.
  const deckCardIds = new Set(deckCards.map((c) => c.id));
  const newReviewed = new Set<string>();
  const reviewReviewed = new Set<string>();
  for (const log of filterTodayLogs(logs, now)) {
    if (!deckCardIds.has(log.card_id)) continue;
    if (log.state === "new") newReviewed.add(log.card_id);
    else if (log.state === "review") reviewReviewed.add(log.card_id);
  }
  const newLimit = Math.max(0, newPerDay - newReviewed.size);
  const reviewLimit = Math.max(0, maxReviews - reviewReviewed.size);

  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  const dayEnd = endOfToday.getTime();
  const learnAheadCutoff = now + SHORT_INTERVAL_MS;

  const newCards: CardRow[] = [];
  const learningCards: CardRow[] = [];
  const reviewCards: CardRow[] = [];
  for (const c of deckCards) {
    if (c.state === "new") {
      newCards.push(c);
    } else if (c.state === "learning" || c.state === "relearning") {
      if (new Date(c.due).getTime() <= learnAheadCutoff) learningCards.push(c);
    } else if (c.state === "review") {
      if (new Date(c.due).getTime() < dayEnd) reviewCards.push(c);
    }
  }

  return {
    newCards: newCards.slice(0, newLimit),
    learningCards,
    reviewCards: reviewCards.slice(0, reviewLimit),
  };
}
