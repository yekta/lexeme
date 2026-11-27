import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bookDays,
  dayKey,
  dayKeyAtOffset,
  daysEndingOn,
  secondsByDayAtOffset,
  streakEndingOn,
  formatReadingTime,
  lastDays,
  readingDate,
  estimatedPageLocations,
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

test("only days that reached the goal count toward the streak", () => {
  const totals = secondsByDay([
    { day: "2026-11-23", seconds: 15 * 60 },
    { day: "2026-11-22", seconds: 16 * 60 },
    { day: "2026-11-21", seconds: 14 * 60 },
    { day: "2026-11-20", seconds: 30 * 60 },
  ]);
  assert.equal(readingStreak(totals, today, 15 * 60), 2);
});

test("today short of the goal keeps yesterday's streak", () => {
  const totals = secondsByDay([
    { day: "2026-11-23", seconds: 5 * 60 },
    { day: "2026-11-22", seconds: 20 * 60 },
  ]);
  assert.equal(readingStreak(totals, today, 15 * 60), 1);
});

test("reading after midnight counts toward the day before until the day starts", () => {
  const lateNight = new Date(2026, 10, 24, 2, 30).getTime();
  const days = bookDays([{ book_id: "a", page: 1, started_at: lateNight, seconds: 600 }], 4 * 60);
  assert.deepEqual(days, [{ book_id: "a", day: "2026-11-23", seconds: 600, pages: 1 }]);
  assert.equal(dayKey(readingDate(lateNight, 4 * 60)), "2026-11-23");
  assert.equal(dayKey(readingDate(lateNight, 0)), "2026-11-24");
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
    locations: null,
  });
  assert.equal(sessions[0].started_at, at(9, 30));
});

test("a session counts the distinct locations its pages covered, once each", () => {
  const located = (page: number, minute: number, location: number, end_location: number) => ({
    ...read(page, 9, minute, 60),
    location,
    end_location,
  });
  const [session] = readingSessions([located(1, 0, 100, 112), located(2, 1, 112, 125), located(1, 2, 100, 112)]);
  assert.equal(session?.pages, 2);
  assert.equal(session?.locations, 25);
});

test("a session with a page of unknown locations has no location count", () => {
  const [session] = readingSessions([{ ...read(1, 9, 0, 60), location: 100, end_location: 112 }, read(2, 9, 1, 60)]);
  assert.equal(session?.locations, null);
});

test("sessions never mix books", () => {
  const sessions = readingSessions([read(1, 9, 0, 60), read(1, 9, 1, 60, "b")]);
  assert.equal(sessions.length, 2);
});

test("a device's reading day follows its own clock, not UTC", () => {
  const lateEvening = Date.UTC(2026, 10, 23, 22, 30);
  assert.equal(dayKeyAtOffset(lateEvening, 0), "2026-11-23");
  assert.equal(dayKeyAtOffset(lateEvening, 180), "2026-11-24");
  // A day that starts at 4:00 keeps 1:30 on the day before.
  assert.equal(dayKeyAtOffset(lateEvening, 180, 240), "2026-11-23");
});

test("days at an offset add up and end on the given day, oldest first", () => {
  const totals = secondsByDayAtOffset(
    [
      { started_at: Date.UTC(2026, 10, 23, 22, 30), seconds: 600 },
      { started_at: Date.UTC(2026, 10, 24, 8, 0), seconds: 300 },
      { started_at: Date.UTC(2026, 10, 22, 10, 0), seconds: 60 },
    ],
    180,
  );
  assert.deepEqual(daysEndingOn(totals, "2026-11-24", 3), [
    { day: "2026-11-22", seconds: 60 },
    { day: "2026-11-23", seconds: 0 },
    { day: "2026-11-24", seconds: 900 },
  ]);
  assert.equal(daysEndingOn(totals, "2026-03-01", 2)[0]!.day, "2026-02-28");
});

test("a streak ending on a day counts back across months, and today unread keeps it", () => {
  const totals = new Map([
    ["2026-10-30", 900],
    ["2026-10-31", 900],
    ["2026-11-01", 900],
    ["2026-11-02", 100],
  ]);
  assert.equal(streakEndingOn(totals, "2026-11-01", 900), 3);
  assert.equal(streakEndingOn(totals, "2026-11-02", 900), 3);
  assert.equal(streakEndingOn(totals, "2026-11-04", 900), 0);
});

test("a page's estimated locations split the book's locations evenly across its pages, end to end", () => {
  assert.deepEqual(estimatedPageLocations(1, 200, 2000), { location: 1, end_location: 11 });
  assert.deepEqual(estimatedPageLocations(200, 200, 2000), { location: 1991, end_location: 2001 });
  assert.deepEqual(estimatedPageLocations(3, 1000, 100), { location: 1, end_location: 2 });
  assert.equal(estimatedPageLocations(1, 0, 2000), null);
});
