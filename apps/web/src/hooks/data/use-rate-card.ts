import { useZero } from "@rocicorp/zero/react";

import {
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  type FSRS,
  type Grade,
} from "@lexeme/shared";
import { commit } from "@/zero/mutate";
import { mutators, type TCardRow } from "@lexeme/contracts";

export type RateArgs = {
  /** The card being reviewed. */
  card: TCardRow;
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
 * Records a review. FSRS scheduling runs here, on the client, and the card
 * patch and its review log go to Zero as one mutation — applied to the local
 * store immediately and replayed to Postgres whenever the network allows, so a
 * study session works start to finish offline.
 *
 * Every timestamp is computed here and passed explicitly, so the optimistic run
 * and the authoritative one cannot disagree about when the review happened.
 *
 * The result is returned synchronously so the session can advance without
 * waiting for anything.
 */
export function useRateCard() {
  const zero = useZero();

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

    commit(
      zero.mutate(
        mutators.card.rate({
          card_id: card.id,
          review_log_id: reviewLogId,
          duration_ms: durationMs,
          card: cardPatch,
          log: {
            rating: log.rating,
            state: log.state,
            due: log.due,
            stability: log.stability,
            difficulty: log.difficulty,
            scheduled_days: log.scheduled_days,
            learning_steps: log.learning_steps,
            review: log.review,
          },
        }),
      ),
      { kind: "cards", rows: [card.id], message: "Failed to save rating" },
    );

    return {
      intervalMs: result.card.due.getTime() - now.getTime(),
      dbFields: cardPatch,
    };
  };

  return { rate };
}
