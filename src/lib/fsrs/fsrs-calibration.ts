import { FSRS_DEFAULT_W } from "@/lib/fsrs/fsrs";
import {
  countLongTermReviews,
  flattenForTraining,
  trainableHistories,
  type TCardHistory,
} from "@/lib/fsrs/fsrs-history";
import { replayHistories, type TMemoryState } from "@/lib/fsrs/fsrs-replay";
import type {
  TTrainRequest,
  TTrainResponse,
} from "@/workers/fsrs-trainer.worker";

export const MIN_REVIEWS_TO_CALIBRATE = 400;

export const CALIBRATION_INTERVAL_DAYS = 2;

const CALIBRATION_INTERVAL_MS = CALIBRATION_INTERVAL_DAYS * 86_400_000;

export function shouldCalibrate({
  totalReviews,
  lastCalibratedAt,
  now,
}: {
  totalReviews: number;
  lastCalibratedAt: Date | null;
  now: Date;
}): { ok: true } | { ok: false; reason: string } {
  if (totalReviews < MIN_REVIEWS_TO_CALIBRATE) {
    return {
      ok: false,
      reason: `has ${totalReviews} reviews, needs ${MIN_REVIEWS_TO_CALIBRATE}`,
    };
  }
  if (lastCalibratedAt === null) return { ok: true };

  const nextAllowed = new Date(
    lastCalibratedAt.getTime() + CALIBRATION_INTERVAL_MS,
  );
  if (now < nextAllowed) {
    return {
      ok: false,
      reason: `last pass ran ${lastCalibratedAt.toLocaleString()}, next one allowed ${nextAllowed.toLocaleString()}`,
    };
  }
  return { ok: true };
}

export function areWeightsValid(w: readonly number[]): boolean {
  return (
    w.length === FSRS_DEFAULT_W.length && w.every((v) => Number.isFinite(v))
  );
}

export function trainWeights(request: TTrainRequest): Promise<TTrainResponse> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("@/workers/fsrs-trainer.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (error) {
      resolve({ ok: false, error: `worker failed to start: ${error}` });
      return;
    }
    const finish = (response: TTrainResponse) => {
      worker.terminate();
      resolve(response);
    };
    worker.onmessage = (event: MessageEvent<TTrainResponse>) =>
      finish(event.data);
    worker.onerror = (event) =>
      finish({ ok: false, error: event.message || String(event) });
    worker.postMessage(request);
  });
}

export type TCalibrationOutcome =
  | {
      status: "improved";
      w: number[];
      memoryStates: Array<{ id: string } & TMemoryState>;
    }
  | { status: "unchanged" }
  | { status: "insufficient-data" }
  | { status: "failed"; reason: string };

export async function calibrate({
  histories,
  currentW,
  enableShortTerm,
  numRelearningSteps,
}: {
  histories: TCardHistory[];
  currentW: number[];
  enableShortTerm: boolean;
  numRelearningSteps: number;
}): Promise<TCalibrationOutcome> {
  // Training uses only cards with a cross-day review; the replay below still
  // covers every card, so all of them get a refreshed memory state.
  const trainable = trainableHistories(histories);
  const longTerm = countLongTermReviews(trainable);
  if (longTerm < MIN_REVIEWS_TO_CALIBRATE) {
    return { status: "insufficient-data" };
  }

  const { ratings, deltaTs, lengths } = flattenForTraining(trainable);
  const result = await trainWeights({
    ratings,
    deltaTs,
    lengths,
    enableShortTerm,
    numRelearningSteps,
  });
  if (!result.ok) {
    // fsrs-rs is the authority on what's trainable — its own verdict outranks
    // any threshold we guess at from outside.
    if (result.error.includes("NotEnoughData")) {
      return { status: "insufficient-data" };
    }
    return { status: "failed", reason: result.error };
  }
  const candidateW = result.w;
  if (!areWeightsValid(candidateW)) {
    return {
      status: "failed",
      reason: `the optimizer returned unusable weights (${candidateW.length} values)`,
    };
  }

  const current = replayHistories(histories, currentW);
  const candidate = replayHistories(histories, candidateW);
  if (current.logLoss === null || candidate.logLoss === null) {
    return {
      status: "failed",
      reason: "no reviews were scoreable, so the weights could not be compared",
    };
  }
  if (candidate.logLoss >= current.logLoss) return { status: "unchanged" };

  return {
    status: "improved",
    w: candidateW,
    memoryStates: [...candidate.states].map(([id, state]) => ({
      id,
      ...state,
    })),
  };
}

export function memoryStatesFor(
  histories: readonly TCardHistory[],
  w: readonly number[],
): Array<{ id: string } & TMemoryState> {
  return [...replayHistories(histories, w).states].map(([id, state]) => ({
    id,
    ...state,
  }));
}
