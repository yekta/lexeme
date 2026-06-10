import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  newCardDefaults,
} from "./lib/defaults";
import { requireDeck, requireProfile, requireUserId } from "./lib/auth";

/** Map a deck document to the row shape the client expects. */
function deckToRow(d: Doc<"decks">) {
  return {
    id: d._id,
    name: d.name,
    description: d.description,
    learning_profile_id: d.learning_profile_id,
    created_at: d._creationTime,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const decks = await ctx.db
      .query("decks")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    decks.sort((a, b) => b._creationTime - a._creationTime);
    return decks.map(deckToRow);
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const deck = await requireDeck(ctx, id, userId);
    return {
      id: deck._id,
      name: deck.name,
      description: deck.description,
      learning_profile_id: deck.learning_profile_id,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    learning_profile_id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, args.learning_profile_id, userId);
    return await ctx.db.insert("decks", {
      user_id: userId,
      name: args.name,
      description: args.description,
      learning_profile_id: profile._id,
      updated_at: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    description: v.string(),
    learning_profile_id: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const deck = await requireDeck(ctx, args.id, userId);
    const profile = await requireProfile(ctx, args.learning_profile_id, userId);
    await ctx.db.patch(deck._id, {
      name: args.name,
      description: args.description,
      learning_profile_id: profile._id,
      updated_at: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const deck = await requireDeck(ctx, id, userId);
    // No cascading deletes in Convex — remove cards and their review logs first.
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_deck", (q) => q.eq("deck_id", deck._id))
      .collect();
    for (const card of cards) {
      const logs = await ctx.db
        .query("reviewLogs")
        .withIndex("by_card", (q) => q.eq("card_id", card._id))
        .collect();
      for (const log of logs) await ctx.db.delete(log._id);
      await ctx.db.delete(card._id);
    }
    await ctx.db.delete(deck._id);
  },
});

/** Create a deck and all its cards in one (atomic) mutation — the import flow. */
export const importDeck = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    learning_profile_id: v.string(),
    cards: v.array(v.object({ front: v.string(), back: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, args.learning_profile_id, userId);
    const deckId = await ctx.db.insert("decks", {
      user_id: userId,
      name: args.name,
      description: args.description,
      learning_profile_id: profile._id,
      updated_at: Date.now(),
    });
    for (const c of args.cards) {
      await ctx.db.insert("cards", {
        deck_id: deckId,
        user_id: userId,
        front: c.front,
        back: c.back,
        ...newCardDefaults(),
      });
    }
    return deckId;
  },
});

/**
 * Snapshot a deck and its cards as a portable payload. Strips ids, FSRS state,
 * and the learning-profile reference so a re-import starts fresh.
 */
export const exportDeck = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const deck = await requireDeck(ctx, id, userId);
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_deck", (q) => q.eq("deck_id", deck._id))
      .collect();
    cards.sort((a, b) => a._creationTime - b._creationTime);
    return {
      version: DECK_EXPORT_VERSION,
      kind: DECK_EXPORT_KIND,
      deck: { name: deck.name, description: deck.description },
      cards: cards.map((c) => ({ front: c.front, back: c.back })),
    };
  },
});
