import { v } from "convex/values";

import { query } from "./_generated/server";
import { requireUserId } from "./lib/auth";

/**
 * The user's review logs since `since` (the client passes local start-of-day) —
 * enough to power today's stats and the per-day new/review limits, without
 * loading the full review history.
 */
export const listToday = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const userId = await requireUserId(ctx);
    const logs = await ctx.db
      .query("reviewLogs")
      .withIndex("by_user_review", (q) =>
        q.eq("user_id", userId).gte("review", since),
      )
      .collect();
    return logs.map((l) => ({
      id: l._id,
      card_id: l.card_id,
      state: l.state,
      duration_ms: l.duration_ms,
      review: l.review,
    }));
  },
});
