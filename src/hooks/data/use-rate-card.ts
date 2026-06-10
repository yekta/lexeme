"use client";

import { useMutation } from "convex/react";

import { runMutation } from "@/db/mutations";
import { tempId } from "@/db/optimistic";
import { api } from "@/lib/convex-api";
import {
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  type FSRS,
  type Grade,
} from "@/lib/fsrs";
import { startOfDayMs } from "@/lib/time";
import type { CardRow } from "@/lib/types";

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
 * Records a review. FSRS scheduling runs here on the client; the new card state
 * and review log are applied optimistically across both queries in one Convex
 * mutation, persisted in the background. The result is returned synchronously
 * so the study session can advance immediately.
 */
export function useRateCard() {
  const rateMutation = useMutation(api.cards.rate).withOptimisticUpdate(
    (store, args) => {
      const cards = store.getQuery(api.cards.listByUser, {});
      if (cards !== undefined) {
        store.setQuery(
          api.cards.listByUser,
          {},
          cards.map((c) =>
            c.id === args.cardId ? ({ ...c, ...args.card } as typeof c) : c,
          ),
        );
      }
      const since = startOfDayMs(Date.now());
      const logs = store.getQuery(api.reviewLogs.listToday, { since });
      if (logs !== undefined) {
        const tempLog = {
          id: tempId(),
          card_id: args.cardId,
          state: args.log.state,
          duration_ms: args.durationMs,
          review: args.log.review,
        } as (typeof logs)[number];
        store.setQuery(api.reviewLogs.listToday, { since }, [...logs, tempLog]);
      }
    },
  );

  const rate = ({ card, scheduler, rating, durationMs }: RateArgs): RateResult => {
    const now = new Date();
    const result = scheduler.next(dbRowToFSRSCard(card), now, rating);
    const cardPatch = fsrsCardToDbRow(result.card);
    const logRow = reviewLogToDbRow(result.log, card.id, durationMs);

    void runMutation(
      "cards",
      rateMutation({
        cardId: card.id,
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
      }),
      "Failed to save rating",
    );

    return {
      intervalMs: result.card.due.getTime() - now.getTime(),
      dbFields: cardPatch,
    };
  };

  return { rate };
}
