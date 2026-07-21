import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { GENERATE_CARD_EXCLUDE_FRONTS_LIMIT } from "@/lib/constants";
import { generateBack } from "@/server/ai/generate-back";
import { generateCard } from "@/server/ai/generate-card";
import { requireCard, requireDeck } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, reviewLogs } from "@/server/db/schema";
import { generateTxId } from "@/server/db/txid";

const cardState = z.enum(["new", "learning", "review", "relearning"]);
const GENERATE_CARD_BACK_CONTEXT_LIMIT = 20;
const GENERATE_CARD_FRONT_CONTEXT_LIMIT = 10_000;

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

  generateBack: protectedProcedure
    .input(
      z.object({
        deckId: z.uuid(),
        front: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.deckId,
        userId: ctx.session.user.id,
      });

      const recentCards = await ctx.db
        .select({ front: cards.front, back: cards.back })
        .from(cards)
        .where(
          and(eq(cards.deck_id, input.deckId), ne(cards.front, input.front)),
        )
        .orderBy(desc(cards.created_at))
        .limit(GENERATE_CARD_BACK_CONTEXT_LIMIT);

      if (recentCards.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add at least one card before generating a back.",
        });
      }

      const back = await generateBack({
        front: input.front,
        recentCards,
      });
      return { back };
    }),

  generateCard: protectedProcedure
    .input(
      z.object({
        deckId: z.uuid(),
        excludeFronts: z
          .array(z.string().trim().min(1))
          .max(GENERATE_CARD_EXCLUDE_FRONTS_LIMIT)
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.deckId,
        userId: ctx.session.user.id,
      });

      const [existingFronts, recentCards] = await Promise.all([
        ctx.db
          .select({ front: cards.front })
          .from(cards)
          .where(eq(cards.deck_id, input.deckId))
          .orderBy(desc(cards.created_at))
          .limit(GENERATE_CARD_FRONT_CONTEXT_LIMIT),
        ctx.db
          .select({ front: cards.front, back: cards.back })
          .from(cards)
          .where(eq(cards.deck_id, input.deckId))
          .orderBy(desc(cards.created_at))
          .limit(GENERATE_CARD_BACK_CONTEXT_LIMIT),
      ]);

      if (existingFronts.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add at least one card before suggesting a new one.",
        });
      }

      return generateCard({
        existingFronts: existingFronts.map((c) => c.front),
        rejectedFronts: input.excludeFronts,
        recentCards,
      });
    }),

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
