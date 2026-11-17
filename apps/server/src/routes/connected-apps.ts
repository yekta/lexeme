import type { TConnectedApp } from "@lexeme/contracts";
import { oauthClients, oauthGrants } from "@lexeme/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { requireUserId } from "../http.ts";

export const connectedAppRoutes = new Hono()
  .get("/", async (c) => {
    const userId = await requireUserId(c);
    const rows = await db
      .select({ grant: oauthGrants, clientName: oauthClients.name })
      .from(oauthGrants)
      .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.client_id))
      .where(eq(oauthGrants.user_id, userId))
      .orderBy(desc(oauthGrants.created_at));
    const apps: TConnectedApp[] = rows.map(({ grant, clientName }) => ({
      id: grant.id,
      client_name: clientName,
      role: grant.role,
      last_used_at: grant.last_used_at?.toISOString() ?? null,
      created_at: grant.created_at.toISOString(),
    }));
    return c.json({ apps });
  })
  .delete("/:id", async (c) => {
    const userId = await requireUserId(c);
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw new ApiError("BAD_REQUEST", "Not an app id.");

    const deleted = await db
      .delete(oauthGrants)
      .where(and(eq(oauthGrants.id, id.data), eq(oauthGrants.user_id, userId)))
      .returning({ id: oauthGrants.id });
    if (deleted.length === 0) throw new ApiError("NOT_FOUND", "That app is no longer connected.");
    return c.json({ ok: true as const });
  });
