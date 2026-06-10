import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireCard, requireDeck } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cardContents, cards, decks, reviewLogs } from "@/server/db/schema";

const cardState = z.enum(["new", "learning", "review", "relearning"]);

export const cardsRouter = createTRPCRouter({
  /**
   * Every card the user owns, across all decks — the local-first card store.
   * FSRS fields and content are returned together so the client can derive
   * deck stats and study queues without further round trips.
   */
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select({
        id: cards.id,
        deck_id: cards.deck_id,
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
        created_at: cards.created_at,
        updated_at: cards.updated_at,
        front: cardContents.front,
        back: cardContents.back,
        content_updated_at: cardContents.updated_at,
      })
      .from(cards)
      .innerJoin(cardContents, eq(cardContents.card_id, cards.id))
      .innerJoin(decks, eq(decks.id, cards.deck_id))
      .where(eq(decks.user_id, ctx.session.user.id))
      .orderBy(desc(cards.created_at));
  }),

  create: protectedProcedure
    .input(
      z.object({
        deckId: z.uuid(),
        cards: z
          .array(
            z.object({
              id: z.uuid(),
              front: z.string().trim().min(1),
              back: z.string().trim().min(1),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.deckId,
        userId: ctx.session.user.id,
      });

      // Card ids are client-generated; content row ids fall back to the
      // database default. One transaction so partial imports never leak.
      // onConflictDoNothing keeps an outbox replay idempotent.
      await ctx.db.transaction(async (tx) => {
        await tx
          .insert(cards)
          .values(input.cards.map((c) => ({ id: c.id, deck_id: input.deckId })))
          .onConflictDoNothing();
        await tx
          .insert(cardContents)
          .values(
            input.cards.map((c) => ({
              card_id: c.id,
              front: c.front,
              back: c.back,
            })),
          )
          .onConflictDoNothing();
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCard({
        db: ctx.db,
        cardId: input.id,
        userId: ctx.session.user.id,
      });
      await ctx.db
        .update(cardContents)
        .set({ front: input.front, back: input.back })
        .where(eq(cardContents.card_id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireCard({
        db: ctx.db,
        cardId: input.id,
        userId: ctx.session.user.id,
      });
      await ctx.db.delete(cards).where(eq(cards.id, input.id));
    }),

  /**
   * Persist a review. FSRS scheduling runs on the client (it already owns the
   * scheduler for the interval previews), so this just writes the resulting
   * card state and review log it computed. Card ownership is still verified.
   */
  rate: protectedProcedure
    .input(
      z.object({
        cardId: z.uuid(),
        reviewLogId: z.uuid(),
        durationMs: z.number().int().min(0),
        card: z.object({
          due: z.date(),
          stability: z.number(),
          difficulty: z.number(),
          scheduled_days: z.number().int(),
          reps: z.number().int(),
          lapses: z.number().int(),
          state: cardState,
          learning_steps: z.number().int(),
          last_review: z.date().nullable(),
        }),
        log: z.object({
          rating: z.number().int(),
          state: cardState,
          due: z.date(),
          stability: z.number(),
          difficulty: z.number(),
          scheduled_days: z.number().int(),
          learning_steps: z.number().int(),
          review: z.date(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCard({
        db: ctx.db,
        cardId: input.cardId,
        userId: ctx.session.user.id,
      });

      await ctx.db.transaction(async (tx) => {
        await tx
          .update(cards)
          .set(input.card)
          .where(eq(cards.id, input.cardId));
        // onConflictDoNothing on the review-log id keeps an outbox replay
        // idempotent — re-applying the same rating is a no-op. The card update
        // is naturally idempotent (it sets absolute FSRS values).
        await tx
          .insert(reviewLogs)
          .values({
            id: input.reviewLogId,
            card_id: input.cardId,
            rating: input.log.rating,
            state: input.log.state,
            due: input.log.due,
            stability: input.log.stability,
            difficulty: input.log.difficulty,
            scheduled_days: input.log.scheduled_days,
            learning_steps: input.log.learning_steps,
            review: input.log.review,
            duration_ms: input.durationMs,
          })
          .onConflictDoNothing();
      });
    }),
});
