import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireProfile } from "@/server/api/access";
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
    .input(z.object({ id: z.uuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .insert(learningProfiles)
        .values({
          id: input.id,
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
      await requireProfile({
        db: ctx.db,
        profileId: id,
        userId: ctx.session.user.id,
      });
      await ctx.db
        .update(learningProfiles)
        .set(fields)
        .where(eq(learningProfiles.id, id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await requireProfile({
        db: ctx.db,
        profileId: input.id,
        userId: ctx.session.user.id,
      });
      if (profile.is_default) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Cannot delete the default profile.",
        });
      }
      await ctx.db
        .delete(learningProfiles)
        .where(eq(learningProfiles.id, input.id));
    }),
});
