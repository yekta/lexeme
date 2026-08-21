import {
  boolean,
  createBuilder,
  createSchema,
  enumeration,
  json,
  number,
  relationships,
  string,
  table,
} from "@rocicorp/zero";

import type { Row } from "@rocicorp/zero";

import type { TCardStateEnum } from "@/server/db/schema";

/**
 * The Zero schema: the subset of the Postgres schema that clients sync.
 *
 * Column names stay snake_case rather than being mapped to camelCase, so the
 * row types here line up with the drizzle `$inferSelect` types the whole app is
 * already written against. Zero maps every one of these from Postgres without a
 * schema change:
 *
 *   uuid        → string    text        → string
 *   timestamptz → number    integer/real→ number
 *   pg enum     → string    pg array    → json
 *
 * The array columns on `learning_profiles` are the reason that last line
 * matters: zero-cache treats a pg array as a JSON value and carries its element
 * type through replication, so `real[]` and `text[]` need no conversion.
 *
 * Deliberately NOT synced: the Better Auth tables. They are also absent from
 * the `zero_data` publication (drizzle/0003), so the exclusion holds at the
 * replication layer, not just here.
 *
 * Every table in this file must appear in that publication. A table Zero syncs
 * but the publication omits reaches the client as a permanently empty view.
 */

const learningProfiles = table("learning_profiles")
  .columns({
    id: string(),
    user_id: string(),
    name: string(),
    is_default: boolean(),
    new_cards_per_day: number(),
    max_reviews_per_day: number(),
    request_retention: number(),
    maximum_interval: number(),
    /** FSRS weights: `real[]` upstream, so a JSON array here. */
    w: json<number[]>(),
    enable_fuzz: boolean(),
    enable_short_term: boolean(),
    /**
     * `text[]` upstream — FSRS step strings like "1m"/"10m". Not to be confused
     * with `cards.learning_steps`/`review_logs.learning_steps`, which are plain
     * integers: same column name, different type, different meaning.
     */
    learning_steps: json<string[]>(),
    relearning_steps: json<string[]>(),
    /** Null until a calibration pass has actually completed. */
    last_calibrated_at: number().optional(),
    created_at: number(),
    updated_at: number(),
  })
  .primaryKey("id");

const decks = table("decks")
  .columns({
    id: string(),
    user_id: string(),
    name: string(),
    description: string(),
    learning_profile_id: string(),
    created_at: number(),
    updated_at: number(),
  })
  .primaryKey("id");

const cards = table("cards")
  .columns({
    id: string(),
    deck_id: string(),
    /** Denormalized owner: every synced table filters on it directly. */
    user_id: string(),
    front: string(),
    back: string(),
    due: number(),
    stability: number(),
    difficulty: number(),
    elapsed_days: number(),
    scheduled_days: number(),
    reps: number(),
    lapses: number(),
    state: enumeration<TCardStateEnum>(),
    /** An index into the profile's learning steps, not a step list. */
    learning_steps: number(),
    last_review: number().optional(),
    created_at: number(),
    updated_at: number(),
  })
  .primaryKey("id");

const reviewLogs = table("review_logs")
  .columns({
    id: string(),
    card_id: string(),
    user_id: string(),
    rating: number(),
    state: enumeration<TCardStateEnum>(),
    due: number(),
    stability: number(),
    difficulty: number(),
    scheduled_days: number(),
    learning_steps: number(),
    review: number(),
    duration_ms: number(),
    created_at: number(),
  })
  .primaryKey("id");

const deckRelationships = relationships(decks, ({ one, many }) => ({
  cards: many({ sourceField: ["id"], destField: ["deck_id"], destSchema: cards }),
  learning_profile: one({
    sourceField: ["learning_profile_id"],
    destField: ["id"],
    destSchema: learningProfiles,
  }),
}));

const cardRelationships = relationships(cards, ({ one, many }) => ({
  deck: one({ sourceField: ["deck_id"], destField: ["id"], destSchema: decks }),
  review_logs: many({
    sourceField: ["id"],
    destField: ["card_id"],
    destSchema: reviewLogs,
  }),
}));

const reviewLogRelationships = relationships(reviewLogs, ({ one }) => ({
  card: one({ sourceField: ["card_id"], destField: ["id"], destSchema: cards }),
}));

const learningProfileRelationships = relationships(
  learningProfiles,
  ({ many }) => ({
    decks: many({
      sourceField: ["id"],
      destField: ["learning_profile_id"],
      destSchema: decks,
    }),
  }),
);

export const schema = createSchema({
  tables: [learningProfiles, decks, cards, reviewLogs],
  relationships: [
    deckRelationships,
    cardRelationships,
    reviewLogRelationships,
    learningProfileRelationships,
  ],
});

export type TSchema = typeof schema;

/** Query builder shared by the client's optimistic runs and the server's. */
export const zql = createBuilder(schema);

/**
 * Row types, replacing the drizzle `$inferSelect` aliases the app used to read
 * against. Same field names; the timestamps are `number` here rather than
 * `Date`, which is the one shape change the move to Zero forces on callers.
 */
export type TDeckRow = Row<TSchema["tables"]["decks"]>;
export type TCardRow = Row<TSchema["tables"]["cards"]>;
export type TLearningProfileRow = Row<TSchema["tables"]["learning_profiles"]>;
export type TReviewLogRow = Row<TSchema["tables"]["review_logs"]>;
