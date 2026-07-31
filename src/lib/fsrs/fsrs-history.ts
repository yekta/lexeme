import type { ReviewLogRow } from "@/db/collections";

/** One card's review history, in the flat form both the optimizer and the
 * replay consume. */
export type TCardHistory = {
  cardId: string;
  /** FSRS grades (1..4) in review order. */
  ratings: number[];
  /** Whole days since the previous review; 0 for the first (and for same-day
   * repeats, which FSRS models through its short-term component). */
  deltaTs: number[];
};

const MS_PER_DAY = 86_400_000;

/** Local calendar day index. FSRS `delta_t` counts day boundaries crossed, not
 * elapsed 24h periods — 10pm to 9am next morning is 1 day, not 0. */
function dayIndex(ms: number): number {
  return Math.floor(
    (ms - new Date(ms).getTimezoneOffset() * 60_000) / MS_PER_DAY,
  );
}

/** Per-card histories for `cardIds`. Cards with no logs are omitted. */
export function buildCardHistories(
  cardIds: ReadonlySet<string>,
  logs: readonly ReviewLogRow[],
): TCardHistory[] {
  const byCard = new Map<string, ReviewLogRow[]>();
  for (const log of logs) {
    if (!cardIds.has(log.card_id)) continue;
    // Outside 1..4 isn't a gradeable answer; it would poison the fit.
    if (log.rating < 1 || log.rating > 4) continue;
    const list = byCard.get(log.card_id);
    if (list) list.push(log);
    else byCard.set(log.card_id, [log]);
  }

  const histories: TCardHistory[] = [];
  for (const [cardId, cardLogs] of byCard) {
    cardLogs.sort(
      (a, b) => new Date(a.review).getTime() - new Date(b.review).getTime(),
    );
    const ratings: number[] = [];
    const deltaTs: number[] = [];
    let previous: number | undefined;
    for (const log of cardLogs) {
      const reviewedAt = new Date(log.review).getTime();
      ratings.push(log.rating);
      deltaTs.push(
        previous === undefined
          ? 0
          : Math.max(0, dayIndex(reviewedAt) - dayIndex(previous)),
      );
      previous = reviewedAt;
    }
    histories.push({ cardId, ratings, deltaTs });
  }
  return histories;
}

/** fsrs-rs panics on items with no cross-day review, so a card only ever seen
 * within one session can't be trained on (it still gets a memory state). */
export function trainableHistories(
  histories: readonly TCardHistory[],
): TCardHistory[] {
  return histories.filter((h) => h.deltaTs.some((d) => d > 0));
}

/** Reviews the optimizer can actually learn from: same-day repeats carry no
 * forgetting signal, so only cross-day ones count toward the floor. */
export function countLongTermReviews(
  histories: readonly TCardHistory[],
): number {
  let n = 0;
  for (const h of histories) {
    for (const d of h.deltaTs) if (d > 0) n++;
  }
  return n;
}

/** Total number of reviews across the given histories. */
export function countReviews(histories: readonly TCardHistory[]): number {
  return histories.reduce((n, h) => n + h.ratings.length, 0);
}

/** Flatten histories into the concatenated typed arrays `computeParameters`
 * expects: all reviews back to back, with per-card lengths to slice them. */
export function flattenForTraining(histories: readonly TCardHistory[]): {
  ratings: Uint32Array;
  deltaTs: Uint32Array;
  lengths: Uint32Array;
} {
  const total = countReviews(histories);
  const ratings = new Uint32Array(total);
  const deltaTs = new Uint32Array(total);
  const lengths = new Uint32Array(histories.length);
  let offset = 0;
  for (let i = 0; i < histories.length; i++) {
    const h = histories[i];
    lengths[i] = h.ratings.length;
    for (let j = 0; j < h.ratings.length; j++) {
      ratings[offset] = h.ratings[j];
      deltaTs[offset] = h.deltaTs[j];
      offset++;
    }
  }
  return { ratings, deltaTs, lengths };
}
