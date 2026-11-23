import assert from "node:assert/strict";
import { test } from "node:test";

import { dayKey, formatReadingTime, lastDays, readingStreak, secondsByDay } from "./reading-stats.ts";

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
