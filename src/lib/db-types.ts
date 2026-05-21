/**
 * Row shapes as delivered by ElectricSQL shape streams.
 *
 * Electric serializes Postgres values to JSON: timestamps arrive as ISO
 * strings, numerics as numbers, enums as strings, arrays as arrays. These
 * types intentionally differ from Drizzle's `$inferSelect` (which uses `Date`)
 * — the collections store exactly what Electric syncs.
 */

export type TCardState = "new" | "learning" | "review" | "relearning";

export type TDeckRow = {
  id: string;
  user_id: string;
  name: string;
  description: string;
  learning_profile_id: string;
  created_at: string;
  updated_at: string;
};

export type TCardRow = {
  id: string;
  user_id: string;
  deck_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: TCardState;
  learning_steps: number;
  last_review: string | null;
  created_at: string;
  updated_at: string;
};

export type TCardContentRow = {
  id: string;
  user_id: string;
  card_id: string;
  front: string;
  back: string;
  created_at: string;
  updated_at: string;
};

export type TLearningProfileRow = {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  new_cards_per_day: number;
  max_reviews_per_day: number;
  request_retention: number;
  maximum_interval: number;
  w: number[];
  enable_fuzz: boolean;
  enable_short_term: boolean;
  learning_steps: string[];
  relearning_steps: string[];
  last_calibrated_at: string;
  created_at: string;
  updated_at: string;
};

export type TReviewLogRow = {
  id: string;
  user_id: string;
  card_id: string;
  rating: number;
  state: TCardState;
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  review: string;
  duration_ms: number;
  created_at: string;
};

/** The five app tables synced via Electric, keyed by their shape-proxy path. */
export const SYNCED_TABLES = [
  "decks",
  "cards",
  "card_contents",
  "learning_profiles",
  "review_logs",
] as const;

export type TSyncedTable = (typeof SYNCED_TABLES)[number];
