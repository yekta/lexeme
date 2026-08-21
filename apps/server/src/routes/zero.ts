import { queries, schema } from "@lexeme/contracts";
import { mustGetMutator, mustGetQuery } from "@rocicorp/zero";
import { handleMutateRequest, handleQueryRequest } from "@rocicorp/zero/server";
import { Hono } from "hono";

import { dbProvider } from "../db.ts";
import { getAuthData } from "../session.ts";
import { serverMutators } from "../zero.ts";

/**
 * The two endpoints zero-cache calls, and the whole of this app's authorization.
 *
 * `ctx` is derived from the verified session rather than from anything the
 * client claimed, and every shared query and mutator scopes its rows to
 * `ctx.user_id` — so a client cannot widen its own window by asking
 * differently. A 401 puts the Zero client into its needs-auth state: it keeps
 * working locally and re-syncs once the session is back.
 */
export const zeroRoutes = new Hono()
  /**
   * Where zero-cache asks what a client is allowed to see. It calls this once
   * per synced query to have it transformed with a real context, then serves
   * the rows from its own replica.
   */
  .post("/query", async (c) => {
    const authData = await getAuthData(c.req.raw);
    if (!authData) return c.json({ error: "unauthorized" }, 401);

    const result = await handleQueryRequest({
      handler: (name, args) => {
        const query = mustGetQuery(queries, name);
        return query.fn({ args, ctx: authData });
      },
      schema,
      request: c.req.raw,
      userID: authData.user_id,
    });
    return c.json(result);
  })
  /**
   * The authoritative half of every write. zero-cache forwards each queued
   * mutation here; the same mutator that already ran optimistically on the
   * client runs again inside a Postgres transaction.
   */
  .post("/mutate", async (c) => {
    const authData = await getAuthData(c.req.raw);
    if (!authData) return c.json({ error: "unauthorized" }, 401);

    const result = await handleMutateRequest({
      dbProvider,
      handler: (transact) =>
        transact(async (tx, name, args) => {
          const mutator = mustGetMutator(serverMutators, name);
          await mutator.fn({ tx, ctx: authData, args });
        }),
      request: c.req.raw,
      userID: authData.user_id,
    });
    return c.json(result);
  });
