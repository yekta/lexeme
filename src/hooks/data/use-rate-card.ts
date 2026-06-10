"use client";

import {
  cardsCollection,
  reviewLogsCollection,
  type CardRow,
} from "@/db/collections";
import { offlineAction, type RateLogRow } from "@/db/offline";
import { toastOnPersistError } from "@/db/toast-on-error";
import {
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  type FSRS,
  type Grade,
} from "@/lib/fsrs";

export type RateArgs = {
  /** The card being reviewed. */
  card: CardRow;
  /** The deck's FSRS scheduler (built from its learning profile). */
  scheduler: FSRS;
  rating: Grade;
  durationMs: number;
};

export type RateResult = {
  /** ms until the card is next due — drives same-session requeueing. */
  intervalMs: number;
  /** The card's new FSRS fields, to merge onto the in-session card. */
  dbFields: ReturnType<typeof fsrsCardToDbRow>;
};

type RateInput = {
  cardId: string;
  cardPatch: ReturnType<typeof fsrsCardToDbRow>;
  log: ReturnType<typeof reviewLogToDbRow>;
  reviewLogId: string;
  durationMs: number;
};

// Applies the card patch + review log optimistically; the `rateCard`
// mutationFn rebuilds the server payload from these mutations. The review log
// carries its full FSRS fields (wider than ReviewLogRow) so a replay after a
// tab close still has everything `cards.rate` needs.
const rateCardAction = offlineAction<RateInput>("rateCard", (v) => {
  cardsCollection.update(v.cardId, (c) => {
    Object.assign(c, v.cardPatch);
  });
  reviewLogsCollection.insert({
    id: v.reviewLogId,
    card_id: v.cardId,
    rating: v.log.rating,
    state: v.log.state,
    due: v.log.due,
    stability: v.log.stability,
    difficulty: v.log.difficulty,
    scheduled_days: v.log.scheduled_days,
    learning_steps: v.log.learning_steps,
    review: v.log.review,
    duration_ms: v.durationMs,
  } as RateLogRow);
});

/**
 * Records a review. FSRS scheduling runs here on the client, the new card
 * state and review log are applied optimistically across both collections in
 * one durable transaction, and the server persists them in the background. The
 * result is returned synchronously so the study session can advance immediately.
 */
export function useRateCard() {
  const rate = ({
    card,
    scheduler,
    rating,
    durationMs,
  }: RateArgs): RateResult => {
    const now = new Date();
    const result = scheduler.next(dbRowToFSRSCard(card), now, rating);
    const cardPatch = fsrsCardToDbRow(result.card);
    const log = reviewLogToDbRow(result.log, card.id, durationMs);
    const reviewLogId = crypto.randomUUID();

    const tx = rateCardAction({
      cardId: card.id,
      cardPatch,
      log,
      reviewLogId,
      durationMs,
    });

    toastOnPersistError(tx, "Failed to save rating");

    return {
      intervalMs: result.card.due.getTime() - now.getTime(),
      dbFields: cardPatch,
    };
  };

  return { rate };
}
