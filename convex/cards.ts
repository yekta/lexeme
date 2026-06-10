import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { newCardDefaults } from "./lib/defaults";
import { requireCard, requireDeck, requireUserId } from "./lib/auth";

const cardState = v.union(
  v.literal("new"),
  v.literal("learning"),
  v.literal("review"),
  v.literal("relearning"),
);

/** Map a card document to the flattened row shape the client expects. */
function cardToRow(c: Doc<"cards">) {
  return {
    id: c._id,
    deck_id: c.deck_id,
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    learning_steps: c.learning_steps,
    last_review: c.last_review,
    created_at: c._creationTime,
    updated_at: c.updated_at,
    front: c.front,
    back: c.back,
    content_updated_at: c.content_updated_at,
  };
}

/**
 * Every card the user owns, across all decks — the local-first card store.
 * The deck page filters this client-side (as the old global collection did).
 */
export const listByUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    cards.sort((a, b) => b._creationTime - a._creationTime);
    return cards.map(cardToRow);
  },
});

/** Bulk-insert cards into a deck (single add or import). */
export const create = mutation({
  args: {
    deckId: v.string(),
    cards: v.array(v.object({ front: v.string(), back: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const deck = await requireDeck(ctx, args.deckId, userId);
    const ids = [];
    for (const c of args.cards) {
      ids.push(
        await ctx.db.insert("cards", {
          deck_id: deck._id,
          user_id: userId,
          front: c.front,
          back: c.back,
          ...newCardDefaults(),
        }),
      );
    }
    return ids;
  },
});

/** Edit a card's content. */
export const update = mutation({
  args: { id: v.string(), front: v.string(), back: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const card = await requireCard(ctx, args.id, userId);
    await ctx.db.patch(card._id, {
      front: args.front,
      back: args.back,
      content_updated_at: Date.now(),
      updated_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const card = await requireCard(ctx, id, userId);
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_card", (q) => q.eq("card_id", card._id))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);
    await ctx.db.delete(card._id);
  },
});

/**
 * Persist a review. FSRS scheduling runs on the client; this writes the
 * resulting card state and review log atomically.
 */
export const rate = mutation({
  args: {
    cardId: v.string(),
    durationMs: v.number(),
    card: v.object({
      due: v.number(),
      stability: v.number(),
      difficulty: v.number(),
      scheduled_days: v.number(),
      reps: v.number(),
      lapses: v.number(),
      state: cardState,
      learning_steps: v.number(),
      last_review: v.union(v.number(), v.null()),
    }),
    log: v.object({
      rating: v.number(),
      state: cardState,
      due: v.number(),
      stability: v.number(),
      difficulty: v.number(),
      scheduled_days: v.number(),
      learning_steps: v.number(),
      review: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const card = await requireCard(ctx, args.cardId, userId);
    await ctx.db.patch(card._id, { ...args.card, updated_at: Date.now() });
    await ctx.db.insert("reviewLogs", {
      card_id: card._id,
      user_id: userId,
      rating: args.log.rating,
      state: args.log.state,
      due: args.log.due,
      stability: args.log.stability,
      difficulty: args.log.difficulty,
      scheduled_days: args.log.scheduled_days,
      learning_steps: args.log.learning_steps,
      review: args.log.review,
      duration_ms: args.durationMs,
    });
  },
});
