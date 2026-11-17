import { createApiKeyRequest, type TApiKey } from "@lexeme/contracts";
import { apiKeys } from "@lexeme/db";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { parseBody, requireUserId } from "../http.ts";
import { API_KEY_PREFIX, newToken } from "../tokens.ts";

type TApiKeyRow = typeof apiKeys.$inferSelect;

function present(key: TApiKeyRow): TApiKey {
  return {
    id: key.id,
    name: key.name,
    role: key.role,
    token_prefix: key.token_prefix,
    expires_at: key.expires_at?.toISOString() ?? null,
    last_used_at: key.last_used_at?.toISOString() ?? null,
    created_at: key.created_at.toISOString(),
  };
}

/** Session only: `requireUserId` reads the session cookie, so a key can't mint keys. */
export const apiKeyRoutes = new Hono()
  .get("/", async (c) => {
    const userId = await requireUserId(c);
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.user_id, userId))
      .orderBy(desc(apiKeys.created_at));
    return c.json({ keys: rows.map(present) });
  })
  .post("/", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, createApiKeyRequest);
    const expiresAt = input.expires_at ? new Date(input.expires_at) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new ApiError("BAD_REQUEST", "The expiry date has to be in the future.");
    }

    const [existing] = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.user_id, userId), eq(apiKeys.name, input.name)))
      .limit(1);
    if (existing) throw new ApiError("BAD_REQUEST", "You already have a key with that name.");

    const { token, hash, displayPrefix } = newToken(API_KEY_PREFIX);
    const [key] = await db
      .insert(apiKeys)
      .values({
        user_id: userId,
        name: input.name,
        role: input.role,
        token_prefix: displayPrefix,
        token_hash: hash,
        expires_at: expiresAt,
      })
      .returning();
    return c.json({ key: present(key), token });
  })
  .delete("/:id", async (c) => {
    const userId = await requireUserId(c);
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) throw new ApiError("BAD_REQUEST", "Not a key id.");

    const deleted = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id.data), eq(apiKeys.user_id, userId)))
      .returning({ id: apiKeys.id });
    if (deleted.length === 0) throw new ApiError("NOT_FOUND", "That key no longer exists.");
    return c.json({ ok: true as const });
  });
