import {
  queries,
  type TBookRow,
  type THighlightRow,
  type TLookupRow,
  type TReadingDayRow,
} from "@lexeme/contracts";
import { dayKey, lastDays, readingStreak, secondsByDay, type TReadingDay } from "@lexeme/shared";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { useZeroStatus } from "@/zero/status";

export type TBook = TBookRow;
export type THighlight = THighlightRow;
export type TLookup = TLookupRow;

/** Everything the e-readers reported, for the reading screens. */
export function useReading() {
  const [books, booksDetails] = useQuery(queries.books());
  const [days, daysDetails] = useQuery(queries.readingDays());
  const [highlights, highlightsDetails] = useQuery(queries.highlights());
  const [lookups, lookupsDetails] = useQuery(queries.lookups());
  const status = useZeroStatus(books.length > 0, booksDetails, daysDetails, highlightsDetails, lookupsDetails);
  return { books, days, highlights, lookups, ...status };
}

export type TReadingSummary = {
  todaySeconds: number;
  weekSeconds: number;
  streak: number;
  finishedThisYear: number;
  /** The last 30 days, oldest first. */
  lastDays: TReadingDay[];
};

export function useReadingSummary(books: readonly TBookRow[], days: readonly TReadingDayRow[]): TReadingSummary {
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
