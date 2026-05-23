"use client";

import { createTransaction } from "@tanstack/react-db";

import {
  cardsCollection,
  reviewLogsCollection,
  type CardRow,
} from "@/db/collections";
import { toastOnPersistError } from "@/db/toast-on-error";
import {
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  type FSRS,
  type Grade,
} from "@/lib/fsrs";
import { trpc } from "@/trpc/vanilla";

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

/**
 * Records a review. FSRS scheduling runs here on the client, the new card
 * state and review log are applied optimistically across both collections in
 * one transaction, and the server persists them in the background. The result
 * is returned synchronously so the study session can advance immediately.
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
    const logRow = reviewLogToDbRow(result.log, card.id, durationMs);
    const reviewLogId = crypto.randomUUID();

    const tx = createTransaction({
      mutationFn: async () => {
        await trpc.cards.rate.mutate({
          cardId: card.id,
          reviewLogId,
          durationMs,
          card: cardPatch,
          log: {
            rating: logRow.rating,
            state: logRow.state,
            due: logRow.due,
            stability: logRow.stability,
            difficulty: logRow.difficulty,
            scheduled_days: logRow.scheduled_days,
            learning_steps: logRow.learning_steps,
            review: logRow.review,
          },
        });
        // Reconcile the optimistic overlay with the persisted server rows.
        await Promise.all([
          cardsCollection.utils.refetch(),
          reviewLogsCollection.utils.refetch(),
        ]);
      },
    });

    tx.mutate(() => {
      cardsCollection.update(card.id, (c) => {
        Object.assign(c, cardPatch);
      });
      reviewLogsCollection.insert({
        id: reviewLogId,
        card_id: card.id,
        state: logRow.state,
        duration_ms: durationMs,
        review: logRow.review,
      });
    });

    toastOnPersistError(tx, "Failed to save rating");

    return {
      intervalMs: result.card.due.getTime() - now.getTime(),
      dbFields: cardPatch,
    };
  };

  return { rate };
}
