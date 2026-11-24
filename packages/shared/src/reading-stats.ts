/** One visit to a page, as KOReader records it: when it started and how long it stayed open. */
export type TPageRead = { book_id: string; page: number; started_at: number; seconds: number };

/** Reading time on one local calendar day. */
export type TReadingDay = { day: string; seconds: number };

export type TBookDay = TReadingDay & { book_id: string; pages: number };

export const DEFAULT_DAILY_GOAL_MINUTES = 15;
/** Minutes past midnight a reading day starts at, unless the user moves it. */
export const DEFAULT_DAY_STARTS_AT = 0;

/** A pause between page turns longer than this ends a reading session. */
export const SESSION_GAP_SECONDS = 10 * 60;

/** One sitting with a book: first page turn to last, with time spent and pages seen. */
export type TReadingSession = {
  book_id: string;
  started_at: number;
  ended_at: number;
  seconds: number;
  pages: number;
};

/** YYYY-MM-DD for a local date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The calendar date a moment counts toward, when days start `dayStartsAt` minutes past midnight. */
export function readingDate(time: number, dayStartsAt = DEFAULT_DAY_STARTS_AT): Date {
  return new Date(time - dayStartsAt * 60_000);
}

/** Time and distinct pages per book per reading day. */
export function bookDays(reads: readonly TPageRead[], dayStartsAt = DEFAULT_DAY_STARTS_AT): TBookDay[] {
  const byKey = new Map<string, TBookDay & { pageSet: Set<number> }>();
  for (const read of reads) {
    const day = dayKey(readingDate(read.started_at, dayStartsAt));
    const key = `${read.book_id}|${day}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = { book_id: read.book_id, day, seconds: 0, pages: 0, pageSet: new Set() };
      byKey.set(key, entry);
    }
    entry.seconds += read.seconds;
    entry.pageSet.add(read.page);
  }
  return [...byKey.values()].map(({ pageSet, ...day }) => ({ ...day, pages: pageSet.size }));
}

/** Page reads grouped into sittings per book, newest first. */
export function readingSessions(reads: readonly TPageRead[], gapSeconds = SESSION_GAP_SECONDS): TReadingSession[] {
  const sorted = [...reads].sort((a, b) => a.book_id.localeCompare(b.book_id) || a.started_at - b.started_at);
  const sessions: TReadingSession[] = [];
  let current: (TReadingSession & { pageSet: Set<number> }) | undefined;
  const finish = () => {
    if (!current) return;
    const { pageSet, ...session } = current;
    sessions.push({ ...session, pages: pageSet.size });
  };
  for (const read of sorted) {
    const end = read.started_at + read.seconds * 1000;
    if (!current || current.book_id !== read.book_id || read.started_at - current.ended_at > gapSeconds * 1000) {
      finish();
      current = { book_id: read.book_id, started_at: read.started_at, ended_at: end, seconds: 0, pages: 0, pageSet: new Set() };
    }
    current.ended_at = Math.max(current.ended_at, end);
    current.seconds += read.seconds;
    current.pageSet.add(read.page);
  }
  finish();
  return sessions.sort((a, b) => b.started_at - a.started_at);
}

/** Seconds read per day, across all books. */
export function secondsByDay(days: readonly TReadingDay[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const day of days) totals.set(day.day, (totals.get(day.day) ?? 0) + day.seconds);
  return totals;
}

/**
 * Consecutive days that reached the goal, counting back from today. Today
 * doesn't break the streak until it's over, so it counts from yesterday until
 * today reaches the goal.
 */
export function readingStreak(totals: Map<string, number>, today: Date, goalSeconds = 1): number {
  const reached = (date: Date) => (totals.get(dayKey(date)) ?? 0) >= goalSeconds;
  const cursor = new Date(today);
  if (!reached(cursor)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (reached(cursor)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The last `count` days, oldest first, with what was read on each. */
export function lastDays(totals: Map<string, number>, today: Date, count: number): TReadingDay[] {
  const result: TReadingDay[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    result.push({ day: key, seconds: totals.get(key) ?? 0 });
  }
  return result;
}

/** "1 h 20 min", "45 min", "0 min". */
export function formatReadingTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
