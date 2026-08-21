import { TRPCError } from "@trpc/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { GENERATE_CARD_EXCLUDE_FRONTS_LIMIT } from "@/lib/constants";
import { generateBack } from "@/server/ai/generate-back";
import { generateCard } from "@/server/ai/generate-card";
import { requireDeck } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards } from "@/server/db/schema";

const GENERATE_CARD_BACK_CONTEXT_LIMIT = 20;
const GENERATE_CARD_FRONT_CONTEXT_LIMIT = 10_000;

/**
 * What is left on tRPC: the two AI generators.
 *
 * Reads and writes moved to Zero (src/zero/) — they are synced queries and
 * shared mutators now, so the client answers them from its local store instead
 * of over the wire. These two stay because they have no local equivalent: they
 * call a model with an API key that must never reach a browser, and they read
 * deck context the client already has only to keep the prompt server-side.
 */
export const cardsRouter = createTRPCRouter({
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
});
