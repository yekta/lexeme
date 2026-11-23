import { queries, type TBookRow, type THighlightRow, type TLookupRow } from "@lexeme/contracts";
import {
  bookDays,
  dayKey,
  lastDays,
  readingSessions,
  readingStreak,
  secondsByDay,
  type TBookDay,
  type TReadingDay,
  type TReadingSession,
} from "@lexeme/shared";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { useZeroStatus } from "@/zero/status";

export type TBook = TBookRow;
export type THighlight = THighlightRow;
export type TLookup = TLookupRow;
export type { TBookDay, TReadingSession };

/** Everything the e-readers reported, for the reading screens. */
export function useReading() {
  const [books, booksDetails] = useQuery(queries.books());
  const [pageReads, pageReadsDetails] = useQuery(queries.pageReads());
  const [highlights, highlightsDetails] = useQuery(queries.highlights());
  const [lookups, lookupsDetails] = useQuery(queries.lookups());
  const status = useZeroStatus(books.length > 0, booksDetails, pageReadsDetails, highlightsDetails, lookupsDetails);
  // Days and sessions are worked out here from every page visit the devices recorded.
  const days = useMemo(() => bookDays(pageReads), [pageReads]);
  const sessions = useMemo(() => readingSessions(pageReads), [pageReads]);
  return { books, days, sessions, highlights, lookups, ...status };
}

export type TReadingSummary = {
  todaySeconds: number;
  weekSeconds: number;
  streak: number;
  finishedThisYear: number;
  /** The last 30 days, oldest first. */
  lastDays: TReadingDay[];
};

export function useReadingSummary(books: readonly TBookRow[], days: readonly TReadingDay[]): TReadingSummary {
  return useMemo(() => {
    const today = new Date();
    const totals = secondsByDay(days);
    const month = lastDays(totals, today, 30);
    const year = today.getFullYear();
    return {
      todaySeconds: totals.get(dayKey(today)) ?? 0,
      weekSeconds: month.slice(-7).reduce((sum, d) => sum + d.seconds, 0),
      streak: readingStreak(totals, today),
      finishedThisYear: books.filter(
        (book) => book.status === "finished" && book.finished_at && new Date(book.finished_at).getFullYear() === year,
      ).length,
      lastDays: month,
    };
  }, [books, days]);
}
