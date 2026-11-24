import assert from "node:assert/strict";
import { test } from "node:test";

import { estimatePageReads } from "./page-estimate.ts";

const MINUTE = 60_000;

test("sessions read the book once, in order, each by its share of the page turns", () => {
  const reads = estimatePageReads(
    [
      { started_at: 2 * MINUTE, seconds: 300, page_turns: 30 },
      { started_at: 0, seconds: 100, page_turns: 10 },
    ],
    40,
  );
  assert.deepEqual(
    reads.map((read) => read.page),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  assert.equal(reads.filter((read) => read.started_at < 2 * MINUTE).length, 10);
});

test("a session's time is split over its pages and adds up to the session", () => {
  const reads = estimatePageReads([{ started_at: 0, seconds: 100, page_turns: 3 }], 3);
  assert.deepEqual(reads, [
    { page: 1, started_at: 0, seconds: 33 },
    { page: 2, started_at: 33_000, seconds: 33 },
    { page: 3, started_at: 66_000, seconds: 34 },
  ]);
});

test("a session with no turn count reads at the book's own pace", () => {
  const reads = estimatePageReads(
    [
      { started_at: 0, seconds: 100, page_turns: 10 },
      { started_at: MINUTE * 10, seconds: 100, page_turns: null },
    ],
    20,
  );
  assert.equal(reads.filter((read) => read.started_at >= MINUTE * 10).length, 10);
});

test("a session too short to finish a page stays on the page it is on", () => {
  const reads = estimatePageReads(
    [
      { started_at: 0, seconds: 60, page_turns: 1 },
      { started_at: MINUTE, seconds: 600, page_turns: 99 },
    ],
    10,
  );
  assert.deepEqual(reads[0], { page: 1, started_at: 0, seconds: 60 });
  assert.equal(reads.at(-1)?.page, 10);
});

test("nothing to spread without pages or sessions", () => {
  assert.deepEqual(estimatePageReads([], 100), []);
  assert.deepEqual(estimatePageReads([{ started_at: 0, seconds: 60, page_turns: 1 }], 0), []);
});
