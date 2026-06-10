import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const cardState = v.union(
  v.literal("new"),
  v.literal("learning"),
  v.literal("review"),
  v.literal("relearning"),
);

export default defineSchema({
  // Note: Better Auth's user/session/account/verification tables live inside
  // the Better Auth component, not here. App tables reference the Better Auth
  // user id (a string) via `user_id`.
  learningProfiles: defineTable({
    user_id: v.string(),
    name: v.string(),
    is_default: v.boolean(),
    new_cards_per_day: v.number(),
    max_reviews_per_day: v.number(),
    request_retention: v.number(),
    maximum_interval: v.number(),
    w: v.array(v.number()),
    enable_fuzz: v.boolean(),
    enable_short_term: v.boolean(),
    learning_steps: v.array(v.string()),
    relearning_steps: v.array(v.string()),
    last_calibrated_at: v.number(),
    updated_at: v.number(),
  }).index("by_user", ["user_id"]),

  decks: defineTable({
    user_id: v.string(),
    name: v.string(),
    description: v.string(),
    learning_profile_id: v.id("learningProfiles"),
    updated_at: v.number(),
  }).index("by_user", ["user_id"]),

  // Card FSRS state and content live together (the old `cards` + `card_contents`
  // tables merged): one document per card, no join.
  cards: defineTable({
    deck_id: v.id("decks"),
    user_id: v.string(),
    due: v.number(),
    stability: v.number(),
    difficulty: v.number(),
    elapsed_days: v.number(),
    scheduled_days: v.number(),
    reps: v.number(),
    lapses: v.number(),
    state: cardState,
    learning_steps: v.number(),
    last_review: v.union(v.number(), v.null()),
    updated_at: v.number(),
    front: v.string(),
    back: v.string(),
    content_updated_at: v.number(),
  })
    .index("by_deck", ["deck_id"])
    .index("by_user", ["user_id"]),

  reviewLogs: defineTable({
    card_id: v.id("cards"),
    user_id: v.string(),
    rating: v.number(),
    state: cardState,
    due: v.number(),
    stability: v.number(),
    difficulty: v.number(),
    scheduled_days: v.number(),
    learning_steps: v.number(),
    review: v.number(),
    duration_ms: v.number(),
  })
    .index("by_user_review", ["user_id", "review"])
    .index("by_card", ["card_id"]),
});
