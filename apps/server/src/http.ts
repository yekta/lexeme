import type { Context } from "hono";
import type { z } from "zod";

import { ApiError } from "./errors.ts";
import { getAuthData } from "./session.ts";

/**
 * The two things every handler below `/api` did as a tRPC procedure, as plain
 * functions: assert a session, and parse the input.
 *
 * `protectedProcedure` and `.input(...)` are what is being replaced here.
 * Calling them explicitly is a couple of lines per route, and in exchange the
 * request shape is a schema in `@lexeme/contracts` that the browser parses the
 * response with too, rather than a type inferred from a router the browser has
 * to import the server to see.
 */

/** The signed-in user's id, or a 401 that stops the handler. */
export async function requireUserId(c: Context): Promise<string> {
  const authData = await getAuthData(c.req.raw);
  if (!authData) throw new ApiError("UNAUTHORIZED", "Sign in to continue.");
  return authData.user_id;
}

/** Parse a JSON body against its contract, or answer 400 with the reason. */
export async function parseBody<TSchema extends z.ZodType>(
  c: Context,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError("BAD_REQUEST", "Expected a JSON body.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");
  }
  return parsed.data;
}
