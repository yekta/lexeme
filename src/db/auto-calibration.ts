"use client";

import { calibrateProfileAction } from "@/db/calibrate-profile";
import {
  cardsCollection,
  decksCollection,
  learningProfilesCollection,
  reviewLogsCollection,
  type LearningProfileRow,
  type ReviewLogRow,
} from "@/db/collections";
import {
  setCalibrationState,
  type TCalibrationState,
} from "@/lib/fsrs/calibration-status";
import { calibrate, shouldCalibrate } from "@/lib/fsrs/fsrs-calibration";
import {
  buildCardHistories,
  countReviews,
  countTrainableCards,
  countTrainingItems,
} from "@/lib/fsrs/fsrs-history";

/** Leave first paint alone before spending CPU on training. */
const IDLE_TIMEOUT_MS = 10_000;
const FALLBACK_DELAY_MS = 3_000;

function debug(...args: unknown[]): void {
  console.info("[calibration]", ...args);
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: IDLE_TIMEOUT_MS });
    } else {
      setTimeout(resolve, FALLBACK_DELAY_MS);
    }
  });
}

/** Cards belonging to the decks on this profile. */
export function cardIdsForProfile(
  profileId: string,
  decks: Array<{ id: string; learning_profile_id: string }>,
  cards: Array<{ id: string; deck_id: string }>,
): Set<string> {
  const deckIds = new Set(
    decks.filter((d) => d.learning_profile_id === profileId).map((d) => d.id),
  );
  const cardIds = new Set<string>();
  for (const card of cards) {
    if (deckIds.has(card.deck_id)) cardIds.add(card.id);
  }
  return cardIds;
}

async function calibrateProfile(
  profile: LearningProfileRow,
  cardIds: Set<string>,
  logs: ReviewLogRow[],
  force: boolean,
): Promise<void> {
  const histories = buildCardHistories(cardIds, logs);
  const totalReviews = countTrainingItems(histories);

  const gate = shouldCalibrate({
    totalReviews,
    lastCalibratedAt: profile.last_calibrated_at
      ? new Date(profile.last_calibrated_at)
      : null,
    now: new Date(),
  });
  if (!gate.ok && !force) {
    debug(`profile "${profile.name}": skipped — ${gate.reason}`);
    return;
  }
  if (!gate.ok)
    debug(`profile "${profile.name}": forced past — ${gate.reason}`);
  debug(
    `profile "${profile.name}": training on ${totalReviews} items, one per cross-day review (of ${countReviews(histories)} reviews total) across ${countTrainableCards(histories)} of ${histories.length} cards`,
  );

  // `ifAvailable` so a second tab skips rather than queueing a duplicate run.
  await navigator.locks.request(
    `fsrs-calibrate:${profile.id}`,
    { ifAvailable: true },
    async (lock) => {
      if (!lock) {
        debug(`profile "${profile.name}": another tab is already calibrating`);
        return;
      }
      setCalibrationState(profile.id, "running");
      let finalState: TCalibrationState = "idle";
      try {
        const outcome = await calibrate({
          histories,
          currentW: profile.w,
          enableShortTerm: profile.enable_short_term,
          numRelearningSteps: profile.relearning_steps.length,
        });
        if (outcome.status === "insufficient-data") {
          finalState = "insufficient-data";
          debug(`profile "${profile.name}": not enough data to train on yet`);
          return;
        }
        if (outcome.status === "failed") {
          // No commit — stamping a failed pass would suppress every retry.
          finalState = "failed";
          debug(`profile "${profile.name}": failed — ${outcome.reason}`);
          return;
        }
        debug(
          `profile "${profile.name}": ${
            outcome.status === "improved"
              ? `new parameters adopted, ${outcome.memoryStates.length} card states refreshed`
              : "existing parameters kept, the new fit was no better"
          }`,
        );
        // `unchanged` still stamps: the evidence was weighed and rejected.
        calibrateProfileAction({
          profileId: profile.id,
          w: outcome.status === "improved" ? outcome.w : profile.w,
          lastCalibratedAt: new Date(),
          memoryStates:
            outcome.status === "improved" ? outcome.memoryStates : [],
        });
      } finally {
        setCalibrationState(profile.id, finalState);
      }
    },
  );
}

/** Fired once per app load — on landing, not after studying, when the tab is
 * usually about to close. Nothing renders behind it. */
export async function startAutoCalibration({
  force = false,
}: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return;
  // Threaded wasm build — no SharedArrayBuffer means it can't start at all.
  if (!crossOriginIsolated) {
    debug(
      "disabled — the page is not cross-origin isolated, so SharedArrayBuffer is unavailable",
    );
    return;
  }

  try {
    if (!force) await whenIdle();
    const [profiles, decks, cards, logs] = await Promise.all([
      learningProfilesCollection.toArrayWhenReady(),
      decksCollection.toArrayWhenReady(),
      cardsCollection.toArrayWhenReady(),
      reviewLogsCollection.toArrayWhenReady(),
    ]);

    debug(
      `checking ${profiles.length} profile(s) against ${logs.length} review logs`,
    );
    for (const profile of profiles) {
      const cardIds = cardIdsForProfile(profile.id, decks, cards);
      if (cardIds.size === 0) {
        debug(`profile "${profile.name}": skipped — no cards`);
        continue;
      }
      await calibrateProfile(profile, cardIds, logs, force);
    }
  } catch (error) {
    // Best-effort: a failed pass just leaves the existing parameters in place.
    debug("aborted", error);
  }
}

/** Dev escape hatch: run a pass now, ignoring the gates. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as { calibrateNow: () => Promise<void> }).calibrateNow =
    () => startAutoCalibration({ force: true });
}
