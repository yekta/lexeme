import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireDeck, requireProfile } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { decks } from "@/server/db/schema";

export const decksRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: decks.id,
        name: decks.name,
        description: decks.description,
        learning_profile_id: decks.learning_profile_id,
        created_at: decks.created_at,
      })
      .from(decks)
      .where(eq(decks.user_id, ctx.session.user.id))
      .orderBy(desc(decks.created_at)),
  ),

  get: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const deck = await requireDeck(ctx.db, input.id, ctx.session.user.id);
      return {
        name: deck.name,
        learning_profile_id: deck.learning_profile_id,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1),
        description: z.string().trim(),
        learning_profile_id: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProfile(
        ctx.db,
        input.learning_profile_id,
        ctx.session.user.id,
      );

      const [row] = await ctx.db
        .insert(decks)
        .values({
          user_id: ctx.session.user.id,
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        })
        .returning({ id: decks.id });
      return row!.id;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1),
        description: z.string().trim(),
        learning_profile_id: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeck(ctx.db, input.id, ctx.session.user.id);
      await requireProfile(
        ctx.db,
        input.learning_profile_id,
        ctx.session.user.id,
      );
      await ctx.db
        .update(decks)
        .set({
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        })
        .where(eq(decks.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireDeck(ctx.db, input.id, ctx.session.user.id);
      await ctx.db.delete(decks).where(eq(decks.id, input.id));
    }),
});
