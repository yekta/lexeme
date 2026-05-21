import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { learningProfiles } from "@/server/db/schema";

export const learningProfilesRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.user_id, ctx.session.user.id))
      .orderBy(desc(learningProfiles.is_default), asc(learningProfiles.name)),
  ),

  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(learningProfiles)
        .values({
          user_id: ctx.session.user.id,
          name: input.name,
          is_default: false,
        })
        .returning({ id: learningProfiles.id });
      return row!.id;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).optional(),
        new_cards_per_day: z.number().int().min(0).optional(),
        max_reviews_per_day: z.number().int().min(0).optional(),
        request_retention: z.number().min(0).max(1).optional(),
        maximum_interval: z.number().int().min(1).optional(),
        w: z.array(z.number()).optional(),
        enable_fuzz: z.boolean().optional(),
        enable_short_term: z.boolean().optional(),
        learning_steps: z.array(z.string()).optional(),
        relearning_steps: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const result = await ctx.db
        .update(learningProfiles)
        .set(fields)
        .where(
          and(
            eq(learningProfiles.id, id),
            eq(learningProfiles.user_id, ctx.session.user.id),
          ),
        )
        .returning({ id: learningProfiles.id });
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db
        .delete(learningProfiles)
        .where(
          and(
            eq(learningProfiles.id, input.id),
            eq(learningProfiles.user_id, ctx.session.user.id),
            eq(learningProfiles.is_default, false),
          ),
        )
        .returning({ id: learningProfiles.id });
      if (result.length === 0)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot delete default profile or profile not found",
        });
    }),
});
