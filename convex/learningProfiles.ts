import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { newProfileDefaults } from "./lib/defaults";
import { requireProfile, requireUserId } from "./lib/auth";

function profileToRow(p: Doc<"learningProfiles">) {
  return {
    id: p._id,
    user_id: p.user_id,
    name: p.name,
    is_default: p.is_default,
    new_cards_per_day: p.new_cards_per_day,
    max_reviews_per_day: p.max_reviews_per_day,
    request_retention: p.request_retention,
    maximum_interval: p.maximum_interval,
    w: p.w,
    enable_fuzz: p.enable_fuzz,
    enable_short_term: p.enable_short_term,
    learning_steps: p.learning_steps,
    relearning_steps: p.relearning_steps,
    last_calibrated_at: p.last_calibrated_at,
    created_at: p._creationTime,
    updated_at: p.updated_at,
  };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profiles = await ctx.db
      .query("learningProfiles")
      .withIndex("by_user", (q) => q.eq("user_id", userId))
      .collect();
    // Default first, then alphabetical.
    profiles.sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return profiles.map(profileToRow);
  },
});

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("learningProfiles", {
      user_id: userId,
      name,
      is_default: false,
      ...newProfileDefaults(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    new_cards_per_day: v.optional(v.number()),
    max_reviews_per_day: v.optional(v.number()),
    request_retention: v.optional(v.number()),
    maximum_interval: v.optional(v.number()),
    w: v.optional(v.array(v.number())),
    enable_fuzz: v.optional(v.boolean()),
    enable_short_term: v.optional(v.boolean()),
    learning_steps: v.optional(v.array(v.string())),
    relearning_steps: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { id, ...fields } = args;
    const profile = await requireProfile(ctx, id, userId);
    await ctx.db.patch(profile._id, { ...fields, updated_at: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const profile = await requireProfile(ctx, id, userId);
    if (profile.is_default) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Cannot delete the default profile.",
      });
    }
    await ctx.db.delete(profile._id);
  },
});
