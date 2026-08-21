import { defineMutator, defineMutators } from "@rocicorp/zero";
import { sql } from "drizzle-orm";

import { cards } from "@lexeme/db";
import {
  calibrateProfileArgs,
  mustBeSignedIn,
  mustOwnProfile,
  mutatorDefs,
} from "@lexeme/contracts";

/**
 * The mutators the authoritative run uses: the shared set, with one override.
 *
 * `learningProfile.calibrate` writes a memory state per card, and the batch is
 * capped at 10,000. Row at a time is the right shape for the client's
 * optimistic run against its local store, and the wrong one for a single HTTP
 * request holding a Postgres transaction open, which is why the tRPC procedure
 * this replaces used one bulk statement, and why the server keeps doing so.
 *
 * The `user_id` predicate is the security boundary, exactly as before: ids the
 * caller doesn't own are inert rather than rejected, so a stale client can't
 * fail the whole batch. And as in the shared version, scheduling fields are
 * deliberately untouched: new weights must never re-date existing cards.
 */
export const serverMutators = defineMutators({
  ...mutatorDefs,
  learningProfile: {
    ...mutatorDefs.learningProfile,
    calibrate: defineMutator(calibrateProfileArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      if (tx.location !== "server") {
        throw new Error("serverMutators.learningProfile.calibrate is server-only.");
      }
      // Overriding the shared mutator means re-stating its access check: it is
      // what stops this from writing weights onto someone else's profile. The
      // bulk UPDATE below carries its own `user_id` predicate; this row does not.
      await mustOwnProfile(tx, user_id, args.id);
      await tx.mutate.learning_profiles.update({
        id: args.id,
        w: args.w,
        last_calibrated_at: args.last_calibrated_at,
        updated_at: Date.now(),
      });
      if (args.memory_states.length === 0) return;

      const values = sql.join(
        args.memory_states.map(
          (s) => sql`(${s.id}::uuid, ${s.stability}::real, ${s.difficulty}::real)`,
        ),
        sql`, `,
      );
      await tx.dbTransaction.wrappedTransaction.execute(sql`
        UPDATE ${cards} SET
          stability = v.stability,
          difficulty = v.difficulty
        FROM (VALUES ${values}) AS v(id, stability, difficulty)
        WHERE ${cards.id} = v.id AND ${cards.user_id} = ${user_id}
      `);
    }),
  },
});
