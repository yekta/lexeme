import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { decks, learningProfiles } from "@/server/db/schema";

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

  byId: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          name: decks.name,
          learning_profile_id: decks.learning_profile_id,
        })
        .from(decks)
        .where(
          and(eq(decks.id, input.id), eq(decks.user_id, ctx.session.user.id)),
        )
        .limit(1);
      return row ?? null;
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
      const [profile] = await ctx.db
        .select({ id: learningProfiles.id })
        .from(learningProfiles)
        .where(
          and(
            eq(learningProfiles.id, input.learning_profile_id),
            eq(learningProfiles.user_id, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!profile) throw new TRPCError({ code: "FORBIDDEN" });

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
      const result = await ctx.db
        .update(decks)
        .set({
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        })
        .where(
          and(eq(decks.id, input.id), eq(decks.user_id, ctx.session.user.id)),
        )
        .returning({ id: decks.id });
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(decks)
        .where(
          and(eq(decks.id, input.id), eq(decks.user_id, ctx.session.user.id)),
        )
        .returning({ id: decks.id });
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    }),
});
