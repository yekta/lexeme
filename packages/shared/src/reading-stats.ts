/** Reading time as e-readers report it: seconds per book per local calendar day. */
export type TReadingDay = { day: string; seconds: number };

/** YYYY-MM-DD for a local date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Seconds read per day, across all books. */
export function secondsByDay(days: readonly TReadingDay[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const day of days) totals.set(day.day, (totals.get(day.day) ?? 0) + day.seconds);
  return totals;
}

/**
 * Consecutive days with reading, counting back from today. A day not read yet
 * doesn't break the streak until it's over, so it counts from yesterday then.
 */
export function readingStreak(totals: Map<string, number>, today: Date): number {
  const cursor = new Date(today);
  if (!totals.get(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (totals.get(dayKey(cursor))) {
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
