import { forgetting_curve, fsrs, type FSRSState } from "ts-fsrs";

import type { TCardHistory } from "@/lib/fsrs/fsrs-history";

export type TMemoryState = { stability: number; difficulty: number };

export type TReplayResult = {
  /** Final memory state per card, derived under the given weights. */
  states: Map<string, TMemoryState>;
  /** Mean binary cross-entropy over predictable reviews, or null when there
   * were none to score. Lower is better. */
  logLoss: number | null;
};

/** Keeps `log(R)` and `log(1 - R)` finite at the extremes. */
const EPSILON = 1e-6;

/** Final memory states and predictive loss under `w`, in one pass. Uses
 * ts-fsrs, not the wasm optimizer, so stored state matches the scheduler that
 * reads it back. */
export function replayHistories(
  histories: readonly TCardHistory[],
  w: readonly number[],
): TReplayResult {
  const algorithm = fsrs({ w: w as number[] });
  const states = new Map<string, TMemoryState>();
  let lossTotal = 0;
  let predictions = 0;

  for (const history of histories) {
    let state: FSRSState | null = null;
    for (let i = 0; i < history.ratings.length; i++) {
      const rating = history.ratings[i];
      const elapsedDays = history.deltaTs[i];

      // Same-day repeats sit at R ≈ 1 and would swamp the comparison. They
      // still advance the state, they just don't vote.
      if (state !== null && elapsedDays > 0) {
        const retrievability = Math.min(
          1 - EPSILON,
          Math.max(EPSILON, forgetting_curve(w, elapsedDays, state.stability)),
        );
        const recalled = rating > 1 ? 1 : 0;
        lossTotal -=
          recalled * Math.log(retrievability) +
          (1 - recalled) * Math.log(1 - retrievability);
        predictions++;
      }

      state = algorithm.next_state(state, elapsedDays, rating);
    }
    if (state !== null) {
      states.set(history.cardId, {
        stability: state.stability,
        difficulty: state.difficulty,
      });
    }
  }

  return {
    states,
    logLoss: predictions > 0 ? lossTotal / predictions : null,
  };
}
