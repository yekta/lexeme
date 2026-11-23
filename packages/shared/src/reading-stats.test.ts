import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookDays,
  dayKey,
  formatReadingTime,
  lastDays,
  readingSessions,
  readingStreak,
  secondsByDay,
  type TPageRead,
} from "./reading-stats.ts";

const today = new Date(2026, 10, 23, 15, 0);

test("adds up every book's time on the same day", () => {
  const totals = secondsByDay([
    { day: "2026-11-23", seconds: 600 },
    { day: "2026-11-23", seconds: 300 },
    { day: "2026-11-22", seconds: 60 },
  ]);
  assert.equal(totals.get("2026-11-23"), 900);
  assert.equal(totals.get("2026-11-22"), 60);
});

test("a streak counts consecutive days back from today", () => {
  const totals = secondsByDay([
    { day: "2026-11-23", seconds: 60 },
    { day: "2026-11-22", seconds: 60 },
    { day: "2026-11-21", seconds: 60 },
    { day: "2026-11-19", seconds: 60 },
  ]);
  assert.equal(readingStreak(totals, today), 3);
});

test("today not read yet keeps yesterday's streak", () => {
  const totals = secondsByDay([
    { day: "2026-11-22", seconds: 60 },
    { day: "2026-11-21", seconds: 60 },
  ]);
  assert.equal(readingStreak(totals, today), 2);
});

test("no reading yesterday or today is no streak", () => {
  assert.equal(readingStreak(secondsByDay([{ day: "2026-11-20", seconds: 60 }]), today), 0);
});

test("the last days run oldest first and end today, with gaps as zero", () => {
  const days = lastDays(secondsByDay([{ day: "2026-11-22", seconds: 120 }]), today, 3);
  assert.deepEqual(days, [
    { day: "2026-11-21", seconds: 0 },
    { day: "2026-11-22", seconds: 120 },
    { day: dayKey(today), seconds: 0 },
  ]);
});

test("reading time reads as hours and minutes", () => {
  assert.equal(formatReadingTime(0), "0 min");
  assert.equal(formatReadingTime(45 * 60), "45 min");
  assert.equal(formatReadingTime(60 * 60), "1 h");
  assert.equal(formatReadingTime(80 * 60 + 20), "1 h 20 min");
});

const at = (hour: number, minute: number) => new Date(2026, 10, 23, hour, minute).getTime();
const read = (page: number, hour: number, minute: number, seconds: number, book_id = "a"): TPageRead => ({
  book_id,
  page,
  started_at: at(hour, minute),
  seconds,
});

test("page reads add up to time and distinct pages per book per day", () => {
  const days = bookDays([read(1, 9, 0, 60), read(2, 9, 1, 60), read(2, 21, 0, 30), read(1, 9, 0, 45, "b")]);
  assert.deepEqual(
    days.find((d) => d.book_id === "a"),
    { book_id: "a", day: "2026-11-23", seconds: 150, pages: 2 },
  );
  assert.equal(days.find((d) => d.book_id === "b")?.seconds, 45);
});

test("a pause longer than ten minutes starts a new session", () => {
  const sessions = readingSessions([read(1, 9, 0, 60), read(2, 9, 1, 60), read(3, 9, 30, 90)]);
  assert.equal(sessions.length, 2);
  assert.deepEqual(sessions[1], {
    book_id: "a",
    started_at: at(9, 0),
    ended_at: at(9, 2),
    seconds: 120,
    pages: 2,
  });
  assert.equal(sessions[0].started_at, at(9, 30));
});

test("sessions never mix books", () => {
  const sessions = readingSessions([read(1, 9, 0, 60), read(1, 9, 1, 60, "b")]);
  assert.equal(sessions.length, 2);
});
