import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireCard, requireDeck } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, reviewLogs } from "@/server/db/schema";
import { generateTxId } from "@/server/db/txid";

const cardState = z.enum(["new", "learning", "review", "relearning"]);

// Reads come from Electric shapes (see src/db/collections.ts); this router
// only carries writes. Every mutation runs in one transaction and returns the
// Postgres txid so the client can await that transaction on the shape stream.
export const cardsRouter = createTRPCRouter({
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

      // Card ids are client-generated. onConflictDoNothing keeps an outbox
      // replay idempotent.
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx
          .insert(cards)
          .values(
            input.cards.map((c) => ({
              id: c.id,
              deck_id: input.deckId,
              user_id: ctx.session.user.id,
              front: c.front,
              back: c.back,
            })),
          )
          .onConflictDoNothing();
        return { txid };
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
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx
          .update(cards)
          .set({ front: input.front, back: input.back })
          .where(eq(cards.id, input.id));
        return { txid };
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireCard({
        db: ctx.db,
        cardId: input.id,
        userId: ctx.session.user.id,
      });
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx.delete(cards).where(eq(cards.id, input.id));
        return { txid };
      });
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

      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
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
            user_id: ctx.session.user.id,
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
        return { txid };
      });
    }),
});
