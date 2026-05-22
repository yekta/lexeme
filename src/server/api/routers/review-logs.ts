import { and, eq, gte } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, decks, reviewLogs } from "@/server/db/schema";

export const reviewLogsRouter = createTRPCRouter({
  /**
   * The user's review logs from the start of today — enough to power today's
   * stats and the per-day new/review limits in the study queue, without
   * loading the full (ever-growing) review history.
   */
  list: protectedProcedure.query(({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return ctx.db
      .select({
        id: reviewLogs.id,
        card_id: reviewLogs.card_id,
        state: reviewLogs.state,
        duration_ms: reviewLogs.duration_ms,
        review: reviewLogs.review,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.card_id))
      .innerJoin(decks, eq(decks.id, cards.deck_id))
      .where(
        and(
          eq(decks.user_id, ctx.session.user.id),
          gte(reviewLogs.review, startOfDay),
        ),
      );
  }),
});
