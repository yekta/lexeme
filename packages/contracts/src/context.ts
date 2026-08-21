import type { TSchema } from "./schema.ts";

/**
 * The context both Zero endpoints derive from the authenticated session, and
 * that the client mirrors for its optimistic runs.
 *
 * Zero 1.x has no separate permission system: every query and every mutator
 * scopes rows to `ctx.user_id`, and on the server that value comes from the
 * verified Better Auth session rather than from anything the client sent. That
 * IS the authorization.
 *
 * The registered context is non-optional: `/api/zero/query` and
 * `/api/zero/mutate` answer 401 before ever invoking a query or mutator without
 * a session, and the client only constructs Zero once it has an identity.
 */
export type TAuthData = {
  user_id: string;
};

/**
 * Defensive runtime check for mutators. The types say `ctx` is there; a mutator
 * writes rows, so verify it anyway rather than trusting the type.
 */
export function mustBeSignedIn(ctx: TAuthData | undefined): TAuthData {
  if (!ctx?.user_id) throw new Error("Not signed in.");
  return ctx;
}

/**
 * Registering `schema` here is what makes the bare `Transaction` type concrete:
 * without it `DefaultSchema` falls back to the generic `Schema`, and every
 * mutator's `tx` stops being assignable to the transaction the request handler
 * actually passes it. `dbProvider` is registered separately, server-side, in
 * `server/zero.ts`.
 */
declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: TSchema;
    context: TAuthData;
  }
}
