/**
 * Server-side copies of the FSRS / per-day defaults used when seeding new
 * learning profiles and cards. These mirror the client-side source of truth in
 * `src/lib/fsrs.ts` and `src/lib/constants.ts`; Convex functions can't resolve
 * the app's `@/` path alias, so the scalar defaults are duplicated here.
 */

export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const DEFAULT_MAX_REVIEWS_PER_DAY = 200;

export const FSRS_DEFAULT_REQUEST_RETENTION = 0.9;
export const FSRS_DEFAULT_MAXIMUM_INTERVAL = 36500;
export const FSRS_DEFAULT_ENABLE_FUZZ = false;
export const FSRS_DEFAULT_ENABLE_SHORT_TERM = true;
export const FSRS_DEFAULT_LEARNING_STEPS = ["1m", "10m"];
export const FSRS_DEFAULT_RELEARNING_STEPS = ["10m"];
export const FSRS_DEFAULT_DECAY = 0.1542;

export const FSRS_DEFAULT_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  FSRS_DEFAULT_DECAY,
];

/** Field defaults for a freshly-created learning profile. */
export function newProfileDefaults() {
  const now = Date.now();
  return {
    new_cards_per_day: DEFAULT_NEW_CARDS_PER_DAY,
    max_reviews_per_day: DEFAULT_MAX_REVIEWS_PER_DAY,
    request_retention: FSRS_DEFAULT_REQUEST_RETENTION,
    maximum_interval: FSRS_DEFAULT_MAXIMUM_INTERVAL,
    w: FSRS_DEFAULT_W,
    enable_fuzz: FSRS_DEFAULT_ENABLE_FUZZ,
    enable_short_term: FSRS_DEFAULT_ENABLE_SHORT_TERM,
    learning_steps: FSRS_DEFAULT_LEARNING_STEPS,
    relearning_steps: FSRS_DEFAULT_RELEARNING_STEPS,
    last_calibrated_at: now,
    updated_at: now,
  };
}

/** FSRS field defaults for a brand-new card. */
export function newCardDefaults() {
  const now = Date.now();
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: "new" as const,
    learning_steps: 0,
    last_review: null,
    updated_at: now,
    content_updated_at: now,
  };
}

export const DECK_EXPORT_VERSION = 1;
export const DECK_EXPORT_KIND = "lexeme-deck";
