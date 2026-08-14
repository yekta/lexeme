import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReviewLogRow } from "@/db/collections";
import {
  buildCardHistories,
  buildTrainingSet,
  countTrainableCards,
  countTrainingItems,
  type TCardHistory,
} from "./fsrs-history.ts";

/** A history from `(rating, delta_t)` pairs, with plausible timestamps. */
function history(
  cardId: string,
  pairs: Array<[rating: number, deltaT: number]>,
  startDay = 0,
): TCardHistory {
  let day = startDay;
  const reviewedAt: number[] = [];
  for (const [, deltaT] of pairs) {
    day += deltaT;
    reviewedAt.push(day * 86_400_000);
  }
  return {
    cardId,
    ratings: pairs.map(([rating]) => rating),
    deltaTs: pairs.map(([, deltaT]) => deltaT),
    reviewedAt,
  };
}

/** Unflatten a training set back into one `(rating, delta_t)` list per item. */
function itemsOf(
  set: ReturnType<typeof buildTrainingSet>,
): Array<Array<[number, number]>> {
  const items: Array<Array<[number, number]>> = [];
  let offset = 0;
  for (const length of set.lengths) {
    const item: Array<[number, number]> = [];
    for (let i = 0; i < length; i++, offset++) {
      item.push([set.ratings[offset], set.deltaTs[offset]]);
    }
    items.push(item);
  }
  assert.equal(offset, set.ratings.length, "every review was consumed");
  return items;
}

test("expands a history the way Anki does", () => {
  // The fixture from fsrs-rs's own convertor tests: seven reviews, five items,
  // each one review longer than the last.
  const reviews: Array<[number, number]> = [
    [3, 0],
    [4, 0],
    [3, 5],
    [3, 10],
    [3, 22],
    [2, 56],
    [3, 64],
  ];
  const set = buildTrainingSet([history("a", reviews)]);

  assert.deepEqual(itemsOf(set), [
    reviews.slice(0, 3),
    reviews.slice(0, 4),
    reviews.slice(0, 5),
    reviews.slice(0, 6),
    reviews.slice(0, 7),
  ]);
});

test("emits one item per cross-day review", () => {
  const histories = [
    history("a", [
      [3, 0],
      [3, 1],
      [4, 3],
    ]),
    history("b", [
      [1, 0],
      [3, 0],
      [3, 2],
    ]),
  ];
  const set = buildTrainingSet(histories);

  assert.equal(set.lengths.length, 3);
  assert.equal(countTrainingItems(histories), set.lengths.length);
  assert.equal(countTrainableCards(histories), 2);
});

test("drops cards that were only ever seen within one day", () => {
  const sameDayOnly = history("a", [
    [1, 0],
    [3, 0],
    [4, 0],
  ]);
  const set = buildTrainingSet([sameDayOnly]);

  // No item, but the card is still there for the replay to give it a state.
  assert.equal(set.lengths.length, 0);
  assert.equal(set.ratings.length, 0);
  assert.equal(countTrainingItems([sameDayOnly]), 0);
  assert.equal(countTrainableCards([sameDayOnly]), 0);
});

test("orders items by the review they predict, not by card", () => {
  // Card "old" was studied first, "new" later. fsrs-rs weights by position, so
  // the recent reviews have to land at the end of the array.
  const histories = [
    history("old", [
      [3, 0],
      [3, 1],
      [3, 1],
    ]),
    history("new", [
      [3, 0],
      [3, 1],
      [3, 1],
    ], 100),
  ];
  const set = buildTrainingSet(histories);

  assert.deepEqual([...set.cardIds], [0n, 0n, 1n, 1n]);

  // Interleaved this time: card "b" is studied between card "a"'s two items.
  const interleaved = buildTrainingSet([
    history("a", [
      [3, 0],
      [3, 1],
      [3, 9],
    ]),
    history(
      "b",
      [
        [3, 0],
        [3, 1],
      ],
      5,
    ),
  ]);
  assert.deepEqual([...interleaved.cardIds], [0n, 1n, 0n]);
});

test("keeps every item's card id aligned with its reviews", () => {
  const set = buildTrainingSet([
    history("a", [
      [3, 0],
      [3, 1],
    ]),
    history("b", [
      [2, 0],
      [2, 1],
      [2, 1],
    ]),
  ]);

  assert.equal(set.cardIds.length, set.lengths.length);
  const byCard = new Map<bigint, Array<Array<[number, number]>>>();
  itemsOf(set).forEach((item, i) => {
    const list = byCard.get(set.cardIds[i]) ?? [];
    list.push(item);
    byCard.set(set.cardIds[i], list);
  });
  for (const [, items] of byCard) {
    // Every item on a card starts with that card's first review.
    assert.ok(items.every((item) => item[0][0] === items[0][0][0]));
  }
});

test("counts day boundaries crossed, not elapsed hours", () => {
  const log = (id: string, rating: number, review: Date) =>
    ({ id, card_id: "a", rating, review }) as unknown as ReviewLogRow;

  const [built] = buildCardHistories(
    new Set(["a"]),
    [
      log("1", 3, new Date(2026, 0, 1, 22, 0)),
      // Eleven hours later, but the next morning: one day, not zero.
      log("2", 3, new Date(2026, 0, 2, 9, 0)),
      // Same day, thirteen hours later: zero.
      log("3", 3, new Date(2026, 0, 2, 22, 0)),
    ],
  );

  assert.deepEqual(built.deltaTs, [0, 1, 0]);
  assert.equal(buildTrainingSet([built]).lengths.length, 1);
});

test("orders a card's reviews by time before deriving deltas", () => {
  const log = (id: string, review: Date) =>
    ({ id, card_id: "a", rating: 3, review }) as unknown as ReviewLogRow;

  const [built] = buildCardHistories(
    new Set(["a"]),
    [
      log("2", new Date(2026, 0, 3, 9, 0)),
      log("1", new Date(2026, 0, 1, 9, 0)),
      log("3", new Date(2026, 0, 8, 9, 0)),
    ],
  );

  assert.deepEqual(built.deltaTs, [0, 2, 5]);
});
