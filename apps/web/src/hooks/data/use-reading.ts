import { mutators, queries, type TBookRow, type THighlightRow, type TLookupRow } from "@lexeme/contracts";
import {
  bookDays,
  dayKey,
  DEFAULT_DAILY_GOAL_MINUTES,
  DEFAULT_DAY_STARTS_AT,
  lastDays,
  readingDate,
  readingSessions,
  readingStreak,
  secondsByDay,
  type TBookDay,
  type TReadingDay,
  type TReadingSession,
} from "@lexeme/shared";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { commit } from "@/zero/mutate";
import { useZeroStatus } from "@/zero/status";

export type TBook = TBookRow;
export type THighlight = THighlightRow;
export type TLookup = TLookupRow;
export type { TBookDay, TReadingSession };

export type TReadingGoal = { daily_minutes: number; day_starts_at: number };

/** The reading goal, or the defaults until the user sets one. */
export function useReadingGoal() {
  const [row, details] = useQuery(queries.readingGoal());
  const goal: TReadingGoal = {
    daily_minutes: row?.daily_minutes ?? DEFAULT_DAILY_GOAL_MINUTES,
    day_starts_at: row?.day_starts_at ?? DEFAULT_DAY_STARTS_AT,
  };
  return { goal, ...useZeroStatus(Boolean(row), details) };
}

export function useUpdateReadingGoal() {
  const zero = useZero();
  return {
    mutateAsync: async (goal: TReadingGoal) => {
      commit(zero.mutate(mutators.readingGoal.update(goal)), {
        kind: "reading_goals",
        message: "Failed to save the reading goal",
      });
    },
  };
}

/** Everything the e-readers reported, for the reading screens, with days cut where the user's day starts. */
export function useReading() {
  const [books, booksDetails] = useQuery(queries.books());
  const [pageReads, pageReadsDetails] = useQuery(queries.pageReads());
  const [highlights, highlightsDetails] = useQuery(queries.highlights());
  const [lookups, lookupsDetails] = useQuery(queries.lookups());
  const { goal, isPending: isPendingGoal } = useReadingGoal();
  const status = useZeroStatus(books.length > 0, booksDetails, pageReadsDetails, highlightsDetails, lookupsDetails);
  // Days and sessions are worked out here from every page visit the devices recorded.
  const days = useMemo(() => bookDays(pageReads, goal.day_starts_at), [pageReads, goal.day_starts_at]);
  const sessions = useMemo(() => readingSessions(pageReads), [pageReads]);
  return {
    books,
    pageReads,
    days,
    sessions,
    highlights,
    lookups,
    goal,
    ...status,
    isPending: status.isPending || isPendingGoal,
  };
}

const CHART_DAYS = 90;
const STREAK_DAYS = 365;

export type TReadingSummary = {
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  streak: number;
  finishedThisYear: number;
  finished: number;
  /** The last 90 days, oldest first. */
  chartDays: TReadingDay[];
  /** The last 365 days, oldest first, for the streak calendar. */
  streakDays: TReadingDay[];
};

export function useReadingSummary(
  books: readonly TBookRow[],
  days: readonly TReadingDay[],
  goal: TReadingGoal,
): TReadingSummary {
  return useMemo(() => {
    const now = Date.now();
    const today = readingDate(now, goal.day_starts_at);
    const totals = secondsByDay(days);
    const year = new Date(now).getFullYear();
    const streakDays = lastDays(totals, today, STREAK_DAYS);
    const finished = books.filter((book) => book.status === "finished");
    return {
      todaySeconds: totals.get(dayKey(today)) ?? 0,
      weekSeconds: streakDays.slice(-7).reduce((sum, d) => sum + d.seconds, 0),
      totalSeconds: days.reduce((sum, d) => sum + d.seconds, 0),
      streak: readingStreak(totals, today, goal.daily_minutes * 60),
      finishedThisYear: finished.filter((book) => book.finished_at && new Date(book.finished_at).getFullYear() === year)
        .length,
      finished: finished.length,
      chartDays: streakDays.slice(-CHART_DAYS),
      streakDays,
    };
  }, [books, days, goal.day_starts_at, goal.daily_minutes]);
}

/** The words that are cards already, lowercased, for marking looked-up words. */
export function useCardWords() {
  const [cards] = useQuery(queries.cards());
  return useMemo(() => new Set(cards.map((card) => card.front.trim().toLowerCase())), [cards]);
}

/** One book and everything recorded about it, newest first. */
export function useBookReading(id: string) {
  const reading = useReading();
  const book = reading.books.find((b) => b.id === id);
  const days = useMemo(
    () => reading.days.filter((d) => d.book_id === id).sort((a, b) => b.day.localeCompare(a.day)),
    [reading.days, id],
  );
  const sessions = useMemo(() => reading.sessions.filter((s) => s.book_id === id), [reading.sessions, id]);
  const highlights = useMemo(
    () => reading.highlights.filter((h) => h.book_id === id).sort((a, b) => b.highlighted_at - a.highlighted_at),
    [reading.highlights, id],
  );
  const words = useMemo(
    () => reading.lookups.filter((l) => l.book_id === id).sort((a, b) => b.looked_up_at - a.looked_up_at),
    [reading.lookups, id],
  );
  return { ...reading, book, days, sessions, highlights, words };
}
