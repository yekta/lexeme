/**
 * The only fields the optimizer reads off a review. Stated structurally so this
 * module sits below the sync schema rather than beside it: the synced
 * `review_logs` row satisfies it, and so does anything else that records an
 * answer. Narrower than `TReviewLogLike` in study-buckets.ts, which also needs
 * the card's state at the time, because training does not.
 */
export type TReviewInput = {
  card_id: string;
  /** FSRS grade, 1..4. */
  rating: number;
  /** When the answer was given: epoch ms, as Zero carries a `timestamptz`. */
  review: number;
};

/** One card's review history, in the flat form both the optimizer and the
 * replay consume. */
export type TCardHistory = {
  cardId: string;
  /** FSRS grades (1..4) in review order. */
  ratings: number[];
  /** Whole days since the previous review; 0 for the first (and for same-day
   * repeats, which FSRS models through its short-term component). */
  deltaTs: number[];
  /** When each review happened, epoch ms. Parallel to `ratings`. */
  reviewedAt: number[];
};

/** The concatenated typed arrays `computeParameters` expects. */
export type TTrainingSet = {
  ratings: Uint32Array;
  deltaTs: Uint32Array;
  lengths: Uint32Array;
  /** Which card each item came from, so fsrs-rs can keep one card's prefixes
   * together in a batch window. Dense indices, not real card ids: fsrs-rs only
   * ever uses this as a grouping key. */
  cardIds: BigInt64Array;
};

const MS_PER_DAY = 86_400_000;

/** Local calendar day index. FSRS `delta_t` counts day boundaries crossed, not
 * elapsed 24h periods: 10pm to 9am next morning is 1 day, not 0. */
function dayIndex(ms: number): number {
  return Math.floor(
    (ms - new Date(ms).getTimezoneOffset() * 60_000) / MS_PER_DAY,
  );
}

/** Per-card histories for `cardIds`. Cards with no logs are omitted. */
export function buildCardHistories(
  cardIds: ReadonlySet<string>,
  logs: readonly TReviewInput[],
): TCardHistory[] {
  const byCard = new Map<string, TReviewInput[]>();
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
    const reviewedAt: number[] = [];
    let previous: number | undefined;
    for (const log of cardLogs) {
      const reviewTime = new Date(log.review).getTime();
      ratings.push(log.rating);
      deltaTs.push(
        previous === undefined
          ? 0
          : Math.max(0, dayIndex(reviewTime) - dayIndex(previous)),
      );
      reviewedAt.push(reviewTime);
      previous = reviewTime;
    }
    histories.push({ cardId, ratings, deltaTs, reviewedAt });
  }
  return histories;
}

/**
 * Reviews the optimizer can actually learn from, which is also exactly the
 * number of training items `buildTrainingSet` emits: one item predicts one
 * review, and only a cross-day review carries a forgetting signal. A card's
 * first review is always `delta_t = 0`, so it never counts.
 */
export function countTrainingItems(histories: readonly TCardHistory[]): number {
  let n = 0;
  for (const h of histories) {
    for (const d of h.deltaTs) if (d > 0) n++;
  }
  return n;
}

/** Cards contributing at least one training item. Cards only ever seen within
 * a single day contribute none (they still get a memory state from the
 * replay). */
export function countTrainableCards(
  histories: readonly TCardHistory[],
): number {
  return histories.filter((h) => h.deltaTs.some((d) => d > 0)).length;
}

/** Total number of reviews across the given histories. */
export function countReviews(histories: readonly TCardHistory[]): number {
  return histories.reduce((n, h) => n + h.ratings.length, 0);
}

/**
 * Expand histories into the training set, one item per predictable review.
 *
 * An FSRS item is *not* a card: it is a single review to predict, preceded by
 * every review that came before it on that card. So a card with n cross-day
 * reviews yields n items, each one review longer than the last. Passing one
 * item per card instead would hand the optimizer a single label per card and
 * leave its initial-stability search (which wants items with exactly one
 * cross-day review) with nothing to fit. This mirrors `reviews_for_fsrs` in
 * Anki's rslib.
 *
 * Items are ordered by the review they predict: fsrs-rs weights items by their
 * position in the array, from 0.25 at the front to 1.0 at the back, so recent
 * reviews have to come last to be weighted as recent.
 */
export function buildTrainingSet(
  histories: readonly TCardHistory[],
): TTrainingSet {
  const items: Array<{ card: number; end: number; at: number }> = [];
  for (let card = 0; card < histories.length; card++) {
    const history = histories[card];
    // From 1: the first review has nothing before it to predict from.
    for (let end = 1; end < history.ratings.length; end++) {
      if (history.deltaTs[end] > 0) {
        items.push({ card, end, at: history.reviewedAt[end] });
      }
    }
  }
  items.sort((a, b) => a.at - b.at);

  const total = items.reduce((n, item) => n + item.end + 1, 0);
  const ratings = new Uint32Array(total);
  const deltaTs = new Uint32Array(total);
  const lengths = new Uint32Array(items.length);
  const cardIds = new BigInt64Array(items.length);
  let offset = 0;
  for (let i = 0; i < items.length; i++) {
    const { card, end } = items[i];
    const history = histories[card];
    for (let j = 0; j <= end; j++) {
      ratings[offset] = history.ratings[j];
      deltaTs[offset] = history.deltaTs[j];
      offset++;
    }
    lengths[i] = end + 1;
    cardIds[i] = BigInt(card);
  }
  return { ratings, deltaTs, lengths, cardIds };
}
