import { appLocale } from "@/lib/constants";
import type {
  TCardContentRow,
  TCardRow,
  TCardState,
  TLearningProfileRow,
  TReviewLogRow,
} from "@/lib/db-types";
import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type FSRS,
  type Card as FSRSCard,
  type FSRSParameters,
  type Grade,
  type StepUnit,
} from "ts-fsrs";

export { createEmptyCard, Rating, State };
export type { FSRS, FSRSCard, FSRSParameters, Grade };

export const FSRS_DEFAULT_REQUEST_RETENTION = 0.9;
export const FSRS_DEFAULT_MAXIMUM_INTERVAL = 36500;
export const FSRS_DEFAULT_ENABLE_FUZZ = false;
export const FSRS_DEFAULT_ENABLE_SHORT_TERM = true;
export const FSRS_DEFAULT_LEARNING_STEPS: readonly StepUnit[] = Object.freeze([
  "1m",
  "10m",
]); // New->Learning,Learning->Learning

export const FSRS_DEFAULT_RELEARNING_STEPS: readonly StepUnit[] = Object.freeze(
  ["10m"],
); // Relearning->Relearning

export const FSRS_DEFAULT_DECAY = 0.1542;

export const FSRS_DEFAULT_W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  FSRS_DEFAULT_DECAY,
]);

type TSchedulerParams = Pick<
  TLearningProfileRow,
  | "request_retention"
  | "maximum_interval"
  | "enable_fuzz"
  | "enable_short_term"
  | "learning_steps"
  | "relearning_steps"
  | "w"
>;

export function createUserScheduler(params: TSchedulerParams): FSRS {
  const fsrsParams: FSRSParameters = {
    request_retention: params.request_retention,
    maximum_interval: params.maximum_interval,
    enable_fuzz: params.enable_fuzz,
    enable_short_term: params.enable_short_term,
    learning_steps: params.learning_steps as StepUnit[],
    relearning_steps: params.relearning_steps as StepUnit[],
    w: params.w,
  };
  return fsrs(fsrsParams);
}

const stateToEnum: Record<State, TCardState> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const enumToState: Record<TCardState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** Convert a synced card row into the shape `ts-fsrs` operates on. */
export function dbRowToFSRSCard(row: {
  due: string | Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: TCardState;
  learning_steps: number;
  last_review: string | Date | null;
}): FSRSCard {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: enumToState[row.state] ?? State.New,
    learning_steps: row.learning_steps,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

/** Build a brand-new card row (FSRS "new" state), keyed with a client UUID. */
export function buildNewCard(opts: {
  deckId: string;
  userId: string;
}): TCardRow {
  const now = new Date();
  const empty = createEmptyCard(now);
  const iso = now.toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: opts.userId,
    deck_id: opts.deckId,
    due: empty.due.toISOString(),
    stability: empty.stability,
    difficulty: empty.difficulty,
    elapsed_days: empty.elapsed_days,
    scheduled_days: empty.scheduled_days,
    reps: empty.reps,
    lapses: empty.lapses,
    state: stateToEnum[empty.state] ?? "new",
    learning_steps: empty.learning_steps,
    last_review: empty.last_review
      ? new Date(empty.last_review).toISOString()
      : null,
    created_at: iso,
    updated_at: iso,
  };
}

/** Build the front/back content row paired with a card. */
export function buildCardContent(opts: {
  cardId: string;
  userId: string;
  front: string;
  back: string;
}): TCardContentRow {
  const iso = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    user_id: opts.userId,
    card_id: opts.cardId,
    front: opts.front,
    back: opts.back,
    created_at: iso,
    updated_at: iso,
  };
}

/**
 * Run an FSRS review entirely on the client: given the current card row, the
 * deck's learning profile and a rating, produce the next card row and the
 * review-log row to write. No server round-trip is needed to schedule a card.
 */
export function applyRating(opts: {
  card: TCardRow;
  profile: TSchedulerParams;
  rating: Grade;
  durationMs: number;
  userId: string;
}): { card: TCardRow; log: TReviewLogRow; intervalMs: number } {
  const scheduler = createUserScheduler(opts.profile);
  const now = new Date();
  const result = scheduler.next(
    dbRowToFSRSCard(opts.card),
    now,
    opts.rating,
  );
  const iso = now.toISOString();

  const card: TCardRow = {
    ...opts.card,
    due: result.card.due.toISOString(),
    stability: result.card.stability,
    difficulty: result.card.difficulty,
    scheduled_days: result.card.scheduled_days,
    reps: result.card.reps,
    lapses: result.card.lapses,
    state: stateToEnum[result.card.state] ?? "new",
    learning_steps: result.card.learning_steps,
    last_review: result.card.last_review
      ? new Date(result.card.last_review).toISOString()
      : iso,
    updated_at: iso,
  };

  const log: TReviewLogRow = {
    id: crypto.randomUUID(),
    user_id: opts.userId,
    card_id: opts.card.id,
    rating: result.log.rating as number,
    state: stateToEnum[result.log.state] ?? "new",
    due: new Date(result.log.due).toISOString(),
    stability: result.log.stability,
    difficulty: result.log.difficulty,
    scheduled_days: result.log.scheduled_days,
    learning_steps: result.log.learning_steps,
    review: new Date(result.log.review).toISOString(),
    duration_ms: opts.durationMs,
    created_at: iso,
  };

  return {
    card,
    log,
    intervalMs: result.card.due.getTime() - now.getTime(),
  };
}

/** Cards due within this window are re-queued in the same study session. */
export const SHORT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function formatInterval(dueDate: Date, now: Date): string {
  const diffMs = dueDate.getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1.1) return "This session | <1m";
  if (diffMinutes < 60) return `This session | <${diffMinutes}m`;

  const diffHours = Math.round(diffMs / 3_600_000);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays < 31) return `${diffDays}d`;

  const diffMonths = diffDays / 30;
  return `${diffMonths.toLocaleString(appLocale, { maximumFractionDigits: 1 })}mo`;
}
