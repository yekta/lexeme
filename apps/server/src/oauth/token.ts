import { oauthAuthorizationCodes, oauthGrants, oauthTokens } from "@lexeme/db";
import { and, eq, isNull, lt } from "drizzle-orm";

import { db } from "../db.ts";
import {
  OAUTH_ACCESS_TOKEN_PREFIX,
  OAUTH_REFRESH_TOKEN_PREFIX,
  hashToken,
  newToken,
} from "../tokens.ts";
import { sameResource, verifyPkceS256 } from "./rules.ts";

const ACCESS_TOKEN_TTL_S = 60 * 60;
const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;

export class OAuthTokenError extends Error {
  constructor(
    readonly error: "invalid_request" | "invalid_grant" | "invalid_target" | "unsupported_grant_type",
    description: string,
  ) {
    super(description);
  }
}

type TTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function mintTokenPair(tx: TTx, grantId: string) {
  const access = newToken(OAUTH_ACCESS_TOKEN_PREFIX);
  const refresh = newToken(OAUTH_REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  await tx.insert(oauthTokens).values([
    {
      grant_id: grantId,
      kind: "access",
      token_hash: access.hash,
      expires_at: new Date(now + ACCESS_TOKEN_TTL_S * 1000),
    },
    {
      grant_id: grantId,
      kind: "refresh",
      token_hash: refresh.hash,
      expires_at: new Date(now + REFRESH_TOKEN_TTL_S * 1000),
    },
  ]);
  return {
    access_token: access.token,
    token_type: "Bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refresh.token,
  };
}

export async function exchangeAuthorizationCode(input: {
  code?: string;
  client_id?: string;
  redirect_uri?: string;
  code_verifier?: string;
  resource?: string;
}) {
  if (!input.code || !input.client_id || !input.redirect_uri || !input.code_verifier) {
    throw new OAuthTokenError(
      "invalid_request",
      "code, client_id, redirect_uri and code_verifier are required.",
    );
  }

  const [code] = await db
    .delete(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.code_hash, hashToken(input.code)))
    .returning();
  if (!code || code.expires_at <= new Date()) {
    throw new OAuthTokenError("invalid_grant", "The code is invalid or has expired.");
  }
  if (code.client_id !== input.client_id || code.redirect_uri !== input.redirect_uri) {
    throw new OAuthTokenError("invalid_grant", "The code was issued to a different client.");
  }
  if (!verifyPkceS256(input.code_verifier, code.code_challenge)) {
    throw new OAuthTokenError("invalid_grant", "The code verifier doesn't match.");
  }
  if (input.resource && !sameResource(input.resource, code.resource)) {
    throw new OAuthTokenError("invalid_target", "The code was issued for a different resource.");
  }

  return db.transaction(async (tx) => {
    const [grant] = await tx
      .insert(oauthGrants)
      .values({
        client_id: code.client_id,
        user_id: code.user_id,
        role: code.role,
        resource: code.resource,
      })
      .returning({ id: oauthGrants.id });
    return mintTokenPair(tx, grant.id);
  });
}

/** Rotates the pair. A refresh token presented twice was stolen or replayed, so the grant goes. */
export async function exchangeRefreshToken(input: { refresh_token?: string; client_id?: string }) {
  if (!input.refresh_token || !input.client_id) {
    throw new OAuthTokenError("invalid_request", "refresh_token and client_id are required.");
  }

  const [row] = await db
    .select({ token: oauthTokens, grant: oauthGrants })
    .from(oauthTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthTokens.grant_id))
    .where(
      and(
        eq(oauthTokens.token_hash, hashToken(input.refresh_token)),
        eq(oauthTokens.kind, "refresh"),
      ),
    )
    .limit(1);
  if (!row || row.grant.client_id !== input.client_id) {
    throw new OAuthTokenError("invalid_grant", "The refresh token is invalid.");
  }
  if (row.token.expires_at <= new Date()) {
    throw new OAuthTokenError("invalid_grant", "The refresh token has expired.");
  }

  const tokens = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(oauthTokens)
      .set({ used_at: new Date() })
      .where(and(eq(oauthTokens.id, row.token.id), isNull(oauthTokens.used_at)))
      .returning({ id: oauthTokens.id });
    if (claimed.length === 0) {
      await tx.delete(oauthGrants).where(eq(oauthGrants.id, row.grant.id));
      return undefined;
    }
    await tx
      .delete(oauthTokens)
      .where(and(eq(oauthTokens.grant_id, row.grant.id), lt(oauthTokens.expires_at, new Date())));
    return mintTokenPair(tx, row.grant.id);
  });
  if (!tokens) {
    throw new OAuthTokenError(
      "invalid_grant",
      "The refresh token was already used, so access was revoked.",
    );
  }
  return tokens;
}
