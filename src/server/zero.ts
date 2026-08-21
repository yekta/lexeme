import { defineMutator, defineMutators } from "@rocicorp/zero";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { sql } from "drizzle-orm";

import type { Auth } from "@/server/auth";
import type { Database } from "@/server/db";
import { cards } from "@/server/db/schema";
import type { TAuthData } from "@/zero/context";
import { mustBeSignedIn } from "@/zero/context";
import {
  calibrateProfileArgs,
  mutatorDefs,
  mustOwnProfile,
} from "@/zero/mutators";
import { schema } from "@/zero/schema";

/**
 * ZQL-capable database used by `/api/zero/mutate` to run the shared mutators
 * authoritatively inside a Postgres transaction. It wraps the request's Drizzle
 * client, so authentication and the mutation share one TCP connection without
 * leaking that connection into another Worker invocation.
 */
export const createDbProvider = (db: Database) => zeroDrizzle(schema, db);
type DbProvider = ReturnType<typeof createDbProvider>;

// Types `tx.dbTransaction.wrappedTransaction` for the server branches of the
// shared mutators (see zero/mutators.ts). Module augmentation is ambient, so
// declaring it here is enough — nothing on the client has to import this file.
declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: DbProvider;
  }
}

/**
 * The mutators the authoritative run uses: the shared set, with one override.
 *
 * `learningProfile.calibrate` writes a memory state per card, and the batch is
 * capped at 10,000. Row at a time is the right shape for the client's
 * optimistic run against its local store, and the wrong one for a single HTTP
 * request holding a Postgres transaction open — which is why the tRPC procedure
 * this replaces used one bulk statement, and why the server keeps doing so.
 *
 * The `user_id` predicate is the security boundary, exactly as before: ids the
 * caller doesn't own are inert rather than rejected, so a stale client can't
 * fail the whole batch. And as in the shared version, scheduling fields are
 * deliberately untouched — new weights must never re-date existing cards.
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

/**
 * Resolve the authenticated user for a request from zero-cache.
 *
 * Deliberately transport-agnostic. zero-cache attaches whichever credential the
 * connecting client gave it, and it can attach either:
 *
 *   if (ctx.auth?.raw)        headers["Authorization"] = `Bearer ${...}`
 *   if (headerOptions.cookie) headers["Cookie"]        = ...
 *
 * The web app takes the cookie path (ZERO_*_FORWARD_COOKIES, which needs the
 * session cookie issued for `.lexeme.fyi` so it is visible on
 * zero.lexeme.fyi). A future Electron or iOS shell has no browser cookie jar
 * and instead passes its stored session cookie as the Zero client's `auth`
 * option, which arrives here as a bearer token. Translating it back into a
 * Cookie header means both shells authenticate through one code path, and the
 * native ones need no change on this side when they land.
 */
export async function getAuthData(
  req: Request,
  auth: Auth,
): Promise<TAuthData | undefined> {
  const headers = new Headers(req.headers);
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && !headers.get("cookie")) {
    headers.set("cookie", bearer.slice("Bearer ".length));
  }
  const session = await auth.api.getSession({ headers });
  return session ? { user_id: session.user.id } : undefined;
}
