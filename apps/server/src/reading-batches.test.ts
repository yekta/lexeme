import assert from "node:assert/strict";
import { test } from "node:test";

import { readingBatches } from "./reading-batches.ts";

const read = (i: number) => ({ id: `r${i}`, book_key: "k", page: i, total_pages: 9000, started_at: i, seconds: 1, imported: true });
const empty = {
  books: [],
  page_reads: [],
  highlights: [],
  lookups: [],
  book_page_reads: [],
  removed_highlight_ids: [],
  removed_lookup_ids: [],
  removed_book_keys: [],
};

test("books go first, rows in batches of 2000, deletions last, and nothing is lost", () => {
  const page_reads = Array.from({ length: 4500 }, (_, i) => read(i));
  const batches = readingBatches({ ...empty, page_reads, removed_book_keys: ["gone"] });
  assert.deepEqual(
    batches.map((batch) => batch.page_reads.length),
    [0, 2000, 2000, 500, 0],
  );
  assert.deepEqual(batches.flatMap((batch) => batch.page_reads), page_reads);
  assert.deepEqual(batches.at(-1)?.removed_book_keys, ["gone"]);
  assert.deepEqual(batches[0]?.removed_book_keys, []);
});

test("the device's position unit is applied once, with the books", () => {
  const batches = readingBatches({ ...empty, position_unit: "location" });
  assert.deepEqual(
    batches.map((batch) => batch.position_unit),
    ["location", undefined],
  );
});
