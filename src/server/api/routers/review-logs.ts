import { and, eq, gte } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, decks, reviewLogs } from "@/server/db/schema";

export const reviewLogsRouter = createTRPCRouter({
  getToday: protectedProcedure.query(async ({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return ctx.db
      .select({
        card_id: reviewLogs.card_id,
        state: reviewLogs.state,
        duration_ms: reviewLogs.duration_ms,
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
