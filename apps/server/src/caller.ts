import { and, eq, gt, isNull, lt, or } from "drizzle-orm";

import { apiKeys, oauthGrants, oauthTokens } from "@lexeme/db";
import type { TAccessRole } from "@lexeme/shared";

import { db } from "./db.ts";
import { API_KEY_PREFIX, OAUTH_ACCESS_TOKEN_PREFIX, hashToken } from "./tokens.ts";
import { MCP_RESOURCE } from "./urls.ts";

/** Whoever is calling the public API or MCP, after their token checked out. */
export type TCaller = {
  userId: string;
  role: TAccessRole;
  via: "api_key" | "oauth";
};

const LAST_USED_INTERVAL_MS = 60_000;

function staleBefore() {
  return new Date(Date.now() - LAST_USED_INTERVAL_MS);
}

function logTouchFailure(error: unknown) {
  console.warn("[api] could not record last use:", error);
}

export async function authenticateApiKey(token: string): Promise<TCaller | undefined> {
  if (!token.startsWith(API_KEY_PREFIX)) return undefined;

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.token_hash, hashToken(token)))
    .limit(1);
  if (!key) return undefined;
  if (key.expires_at && key.expires_at <= new Date()) return undefined;

  db.update(apiKeys)
    .set({ last_used_at: new Date() })
    .where(
      and(
        eq(apiKeys.id, key.id),
        or(isNull(apiKeys.last_used_at), lt(apiKeys.last_used_at, staleBefore())),
      ),
    )
    .catch(logTouchFailure);

  return { userId: key.user_id, role: key.role, via: "api_key" };
}

export async function authenticateOAuthAccessToken(
  token: string,
): Promise<TCaller | undefined> {
  if (!token.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) return undefined;

  const [row] = await db
    .select({ grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grant_id))
    .where(
      and(
        eq(oauthTokens.token_hash, hashToken(token)),
        eq(oauthTokens.kind, "access"),
        gt(oauthTokens.expires_at, new Date()),
      ),
    )
    .limit(1);
  if (!row) return undefined;
  if (row.grant.resource !== MCP_RESOURCE) return undefined;

  db.update(oauthGrants)
    .set({ last_used_at: new Date() })
    .where(
      and(
        eq(oauthGrants.id, row.grant.id),
        or(isNull(oauthGrants.last_used_at), lt(oauthGrants.last_used_at, staleBefore())),
      ),
    )
    .catch(logTouchFailure);

  return { userId: row.grant.user_id, role: row.grant.role, via: "oauth" };
}
