import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { FSRS_DEFAULT_W } from "@/lib/fsrs/fsrs";
import { requireProfile } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, learningProfiles } from "@/server/db/schema";

/** FSRS-6 weight vector: fixed length, all finite — a malformed `w` would
 * corrupt scheduling for every card on the profile. */
const fsrsWeights = z.array(z.number().finite()).length(FSRS_DEFAULT_W.length);

export const learningProfilesRouter = createTRPCRouter({
  /** The user's FSRS profiles, for the client's query collection. */
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(learningProfiles)
      .where(eq(learningProfiles.user_id, ctx.session.user.id)),
  ),

  create: protectedProcedure
    .input(z.object({ id: z.uuid(), name: z.string().trim().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        await tx
          .insert(learningProfiles)
          .values({
            id: input.id,
            user_id: ctx.session.user.id,
            name: input.name,
            is_default: false,
          })
          .onConflictDoNothing();
      });
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
        w: fsrsWeights.optional(),
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
      return ctx.db.transaction(async (tx) => {
        await tx
          .update(learningProfiles)
          .set(fields)
          .where(eq(learningProfiles.id, id));
      });
    }),

  /**
   * Commit an FSRS optimization pass: the profile's new weights plus the card
   * memory states re-derived under them, in one transaction. Scheduling fields
   * (`due`, `state`, `scheduled_days`) are deliberately absent — changing
   * weights must never re-date existing cards, matching Anki's default.
   *
   * Also serves reset, which is just a calibration to the default weights.
   */
  calibrate: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        w: fsrsWeights,
        last_calibrated_at: z.date(),
        memory_states: z
          .array(
            z.object({
              id: z.uuid(),
              stability: z.number().finite(),
              difficulty: z.number().finite(),
            }),
          )
          .max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProfile({
        db: ctx.db,
        profileId: input.id,
        userId: ctx.session.user.id,
      });
      const userId = ctx.session.user.id;
      return ctx.db.transaction(async (tx) => {
        await tx
          .update(learningProfiles)
          .set({ w: input.w, last_calibrated_at: input.last_calibrated_at })
          .where(eq(learningProfiles.id, input.id));

        if (input.memory_states.length === 0) return;

        // Single bulk update rather than a statement per card. The `user_id`
        // predicate is the security boundary: ids the caller doesn't own are
        // inert rather than rejected, so a stale client can't fail the batch.
        const values = sql.join(
          input.memory_states.map(
            (s) =>
              sql`(${s.id}::uuid, ${s.stability}::real, ${s.difficulty}::real)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE ${cards} SET
            stability = v.stability,
            difficulty = v.difficulty
          FROM (VALUES ${values}) AS v(id, stability, difficulty)
          WHERE ${cards.id} = v.id AND ${cards.user_id} = ${userId}
        `);
      });
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
      return ctx.db.transaction(async (tx) => {
        await tx
          .delete(learningProfiles)
          .where(eq(learningProfiles.id, input.id));
      });
    }),
});
