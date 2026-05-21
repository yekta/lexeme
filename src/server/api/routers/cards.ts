import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import {
  createUserScheduler,
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  SHORT_INTERVAL_MS,
  type Grade,
} from "@/lib/fsrs";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  cardContents,
  cards,
  decks,
  learningProfiles,
  reviewLogs,
} from "@/server/db/schema";

export const cardsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ deckId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          id: cards.id,
          created_at: cards.created_at,
          updated_at: cards.updated_at,
          front: cardContents.front,
          back: cardContents.back,
          content_updated_at: cardContents.updated_at,
        })
        .from(cards)
        .innerJoin(decks, eq(decks.id, cards.deck_id))
        .innerJoin(cardContents, eq(cardContents.card_id, cards.id))
        .where(
          and(
            eq(cards.deck_id, input.deckId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .orderBy(desc(cards.created_at));
      return rows;
    }),

  create: protectedProcedure
    .input(
      z.object({
        deckId: z.uuid(),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [deck] = await ctx.db
        .select({ id: decks.id })
        .from(decks)
        .where(
          and(
            eq(decks.id, input.deckId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!deck) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.db.transaction(async (tx) => {
        const [card] = await tx
          .insert(cards)
          .values({ deck_id: input.deckId })
          .returning({ id: cards.id });
        await tx
          .insert(cardContents)
          .values({ card_id: card!.id, front: input.front, back: input.back });
        return card!.id;
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        deckId: z.uuid(),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: cards.id })
        .from(cards)
        .innerJoin(decks, eq(decks.id, cards.deck_id))
        .where(
          and(
            eq(cards.id, input.id),
            eq(cards.deck_id, input.deckId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db
        .update(cardContents)
        .set({ front: input.front, back: input.back })
        .where(eq(cardContents.card_id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid(), deckId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({ id: cards.id })
        .from(cards)
        .innerJoin(decks, eq(decks.id, cards.deck_id))
        .where(
          and(
            eq(cards.id, input.id),
            eq(cards.deck_id, input.deckId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db.delete(cards).where(eq(cards.id, input.id));
    }),

  studyQueue: protectedProcedure
    .input(z.object({ deckId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [ownedDeck] = await ctx.db
        .select({
          deckId: decks.id,
          profile: learningProfiles,
        })
        .from(decks)
        .innerJoin(
          learningProfiles,
          eq(learningProfiles.id, decks.learning_profile_id),
        )
        .where(
          and(
            eq(decks.id, input.deckId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!ownedDeck) throw new TRPCError({ code: "FORBIDDEN" });

      const profile = ownedDeck.profile;
      const newCardsPerDay =
        profile?.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY;
      const maxReviewsPerDay =
        profile?.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY;

      const [{ total } = { total: 0 }] = await ctx.db
        .select({ total: sql<number>`count(*)::int` })
        .from(cards)
        .where(eq(cards.deck_id, input.deckId));

      const soonCutoff = new Date(Date.now() + SHORT_INTERVAL_MS);
      const dueRows = await ctx.db
        .select({
          id: cards.id,
          due: cards.due,
          stability: cards.stability,
          difficulty: cards.difficulty,
          elapsed_days: cards.elapsed_days,
          scheduled_days: cards.scheduled_days,
          reps: cards.reps,
          lapses: cards.lapses,
          state: cards.state,
          learning_steps: cards.learning_steps,
          last_review: cards.last_review,
          front: cardContents.front,
          back: cardContents.back,
        })
        .from(cards)
        .innerJoin(cardContents, eq(cardContents.card_id, cards.id))
        .where(
          and(eq(cards.deck_id, input.deckId), lte(cards.due, soonCutoff)),
        );

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const allDeckCards = await ctx.db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.deck_id, input.deckId));
      const allDeckCardIds = allDeckCards.map((c) => c.id);

      let newReviewedToday = 0;
      let reviewReviewedToday = 0;
      if (allDeckCardIds.length > 0) {
        const todayLogs = await ctx.db
          .select({ card_id: reviewLogs.card_id, state: reviewLogs.state })
          .from(reviewLogs)
          .where(
            and(
              inArray(reviewLogs.card_id, allDeckCardIds),
              gte(reviewLogs.review, startOfDay),
            ),
          );
        const newCardIds = new Set<string>();
        const reviewCardIds = new Set<string>();
        for (const log of todayLogs) {
          if (log.state === "new") newCardIds.add(log.card_id);
          else if (log.state === "review") reviewCardIds.add(log.card_id);
        }
        newReviewedToday = newCardIds.size;
        reviewReviewedToday = reviewCardIds.size;
      }

      const newCards = dueRows.filter((c) => c.state === "new");
      const reviewCards = dueRows.filter((c) => c.state === "review");
      const learningCards = dueRows.filter(
        (c) => c.state === "learning" || c.state === "relearning",
      );

      const newLimit = Math.max(0, newCardsPerDay - newReviewedToday);
      const reviewLimit = Math.max(0, maxReviewsPerDay - reviewReviewedToday);

      const limited = [
        ...newCards.slice(0, newLimit),
        ...learningCards,
        ...reviewCards.slice(0, reviewLimit),
      ];

      // Shuffle (Fisher–Yates).
      for (let i = limited.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [limited[i], limited[j]] = [limited[j]!, limited[i]!];
      }

      return { totalCards: total ?? 0, dueCards: limited };
    }),

  rate: protectedProcedure
    .input(
      z.object({
        cardId: z.uuid(),
        rating: z.union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
        ]),
        durationMs: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await ctx.db
        .select({
          card: cards,
          profile: learningProfiles,
        })
        .from(cards)
        .innerJoin(decks, eq(decks.id, cards.deck_id))
        .innerJoin(
          learningProfiles,
          eq(learningProfiles.id, decks.learning_profile_id),
        )
        .where(
          and(
            eq(cards.id, input.cardId),
            eq(decks.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN" });

      const scheduler = createUserScheduler(owned.profile);
      const fsrsCard = dbRowToFSRSCard(owned.card);
      const now = new Date();
      const result = scheduler.next(fsrsCard, now, input.rating as Grade);
      const dbFields = fsrsCardToDbRow(result.card);

      await ctx.db.transaction(async (tx) => {
        await tx.update(cards).set(dbFields).where(eq(cards.id, input.cardId));
        await tx
          .insert(reviewLogs)
          .values(reviewLogToDbRow(result.log, input.cardId, input.durationMs));
      });

      return {
        newDueIso: result.card.due.toISOString(),
        intervalMs: result.card.due.getTime() - now.getTime(),
        dbFields,
      };
    }),
});
