import { z } from "zod";

/**
 * Standard-Schema definitions for the synced collections. They double as
 * runtime validation of rows arriving from ElectricSQL and as the source of
 * each collection's element type. Shapes mirror `db-types.ts` (timestamps are
 * ISO strings, the form Electric delivers).
 */

const cardState = z.enum(["new", "learning", "review", "relearning"]);

export const deckSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  description: z.string(),
  learning_profile_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const cardSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  deck_id: z.string(),
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number(),
  scheduled_days: z.number(),
  reps: z.number(),
  lapses: z.number(),
  state: cardState,
  learning_steps: z.number(),
  last_review: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const cardContentSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  card_id: z.string(),
  front: z.string(),
  back: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const learningProfileSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  new_cards_per_day: z.number(),
  max_reviews_per_day: z.number(),
  request_retention: z.number(),
  maximum_interval: z.number(),
  w: z.array(z.number()),
  enable_fuzz: z.boolean(),
  enable_short_term: z.boolean(),
  learning_steps: z.array(z.string()),
  relearning_steps: z.array(z.string()),
  last_calibrated_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const reviewLogSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  card_id: z.string(),
  rating: z.number(),
  state: cardState,
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  scheduled_days: z.number(),
  learning_steps: z.number(),
  review: z.string(),
  duration_ms: z.number(),
  created_at: z.string(),
});
