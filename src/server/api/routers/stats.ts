import { and, eq, gte, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  cards,
  decks,
  learningProfiles,
  reviewLogs,
} from "@/server/db/schema";

export const statsRouter = createTRPCRouter({
  today: protectedProcedure.query(async ({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [row] = await ctx.db
      .select({
        count: sql<number>`count(*)::int`,
        totalMs: sql<number>`coalesce(sum(${reviewLogs.duration_ms}), 0)::int`,
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
    const count = row?.count ?? 0;
    const totalMs = row?.totalMs ?? 0;
    return {
      count,
      totalMs,
      msPerCard: count > 0 ? totalMs / count : 0,
    };
  }),

  deckStats: protectedProcedure.query(async ({ ctx }) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const deckAgg = await ctx.db
      .select({
        deckId: decks.id,
        newCardsPerDay: learningProfiles.new_cards_per_day,
        maxReviewsPerDay: learningProfiles.max_reviews_per_day,
        total: sql<number>`count(${cards.id})::int`,
        newCount: sql<number>`coalesce(sum(case when ${cards.state} = 'new' then 1 else 0 end), 0)::int`,
        learnCount: sql<number>`coalesce(sum(case when ${cards.state} in ('learning','relearning') and ${cards.due} <= now() then 1 else 0 end), 0)::int`,
        dueCount: sql<number>`coalesce(sum(case when ${cards.state} = 'review' and ${cards.due} <= now() then 1 else 0 end), 0)::int`,
        latestCardCreatedAt: sql<Date | null>`max(${cards.created_at})`,
      })
      .from(decks)
      .innerJoin(
        learningProfiles,
        eq(learningProfiles.id, decks.learning_profile_id),
      )
      .leftJoin(cards, eq(cards.deck_id, decks.id))
      .where(eq(decks.user_id, ctx.session.user.id))
      .groupBy(
        decks.id,
        learningProfiles.new_cards_per_day,
        learningProfiles.max_reviews_per_day,
      );

    if (deckAgg.length === 0) return [];

    const todayAgg = await ctx.db
      .select({
        deckId: cards.deck_id,
        newReviewed: sql<number>`count(distinct case when ${reviewLogs.state} = 'new' then ${reviewLogs.card_id} end)::int`,
        reviewReviewed: sql<number>`count(distinct case when ${reviewLogs.state} = 'review' then ${reviewLogs.card_id} end)::int`,
      })
      .from(reviewLogs)
      .innerJoin(cards, eq(cards.id, reviewLogs.card_id))
      .innerJoin(decks, eq(decks.id, cards.deck_id))
      .where(
        and(
          eq(decks.user_id, ctx.session.user.id),
          gte(reviewLogs.review, startOfDay),
        ),
      )
      .groupBy(cards.deck_id);

    const todayByDeck = new Map(
      todayAgg.map((r) => [
        r.deckId,
        { newReviewed: r.newReviewed, reviewReviewed: r.reviewReviewed },
      ]),
    );

    return deckAgg.map((row) => {
      const today = todayByDeck.get(row.deckId) ?? {
        newReviewed: 0,
        reviewReviewed: 0,
      };
      const newLimit = Math.max(0, row.newCardsPerDay - today.newReviewed);
      const reviewLimit = Math.max(
        0,
        row.maxReviewsPerDay - today.reviewReviewed,
      );
      const latest =
        row.latestCardCreatedAt instanceof Date
          ? row.latestCardCreatedAt.toISOString()
          : row.latestCardCreatedAt
            ? new Date(row.latestCardCreatedAt).toISOString()
            : null;
      return {
        deckId: row.deckId,
        total: row.total,
        new: Math.min(row.newCount, newLimit),
        learn: row.learnCount,
        due: Math.min(row.dueCount, reviewLimit),
        latestCardCreatedAt: latest,
      };
    });
  }),
});
