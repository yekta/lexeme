import type { TAccessRole } from "@lexeme/shared";
import type { TOAuthAuthorizeParams } from "@lexeme/contracts";
import { oauthAuthorizationCodes, oauthClients } from "@lexeme/db";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db.ts";
import { newToken } from "../tokens.ts";
import { ISSUER, MCP_RESOURCE } from "../urls.ts";
import { redirectUriMatches, sameResource } from "./rules.ts";

const CODE_TTL_MS = 60_000;

type TClient = typeof oauthClients.$inferSelect;

export type TAuthorizeCheck =
  | { ok: true; client: TClient; redirectUri: string; resource: string; params: TOAuthAuthorizeParams }
  | { ok: false; description: string; redirectUrl?: string };

/** Adds `iss`, so a client talking to several servers can tell whose answer this is (RFC 9207). */
function withParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries({ ...params, iss: ISSUER })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function errorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state: string | undefined,
): string {
  return withParams(redirectUri, { error, error_description: description, state });
}

async function findClient(clientId: string): Promise<TClient | undefined> {
  if (!z.uuid().safeParse(clientId).success) return undefined;
  const [client] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, clientId))
    .limit(1);
  return client;
}

/**
 * Until the client and redirect URI check out, an error is shown here rather
 * than sent anywhere, so an attacker can't use this server as an open redirect.
 */
export async function checkAuthorizeRequest(
  params: TOAuthAuthorizeParams,
): Promise<TAuthorizeCheck> {
  const client = await findClient(params.client_id);
  if (!client) return { ok: false, description: "This app isn't registered with Lexeme." };
  if (!redirectUriMatches(client.redirect_uris, params.redirect_uri)) {
    return { ok: false, description: "This app asked to return to an address it didn't register." };
  }

  const fail = (error: string, description: string): TAuthorizeCheck => ({
    ok: false,
    description,
    redirectUrl: errorRedirect(params.redirect_uri, error, description, params.state),
  });

  if (params.response_type !== "code") {
    return fail("unsupported_response_type", "Only the authorization code flow is supported.");
  }
  if (!params.code_challenge || params.code_challenge_method !== "S256") {
    return fail("invalid_request", "PKCE with S256 is required.");
  }
  const resource = params.resource ?? MCP_RESOURCE;
  if (!sameResource(resource, MCP_RESOURCE)) {
    return fail("invalid_target", `The only resource here is ${MCP_RESOURCE}.`);
  }

  return { ok: true, client, redirectUri: params.redirect_uri, resource: MCP_RESOURCE, params };
}

export async function issueAuthorizationCode({
  check,
  userId,
  role,
}: {
  check: Extract<TAuthorizeCheck, { ok: true }>;
  userId: string;
  role: TAccessRole;
}): Promise<string> {
  await db
    .delete(oauthAuthorizationCodes)
    .where(lt(oauthAuthorizationCodes.expires_at, new Date()));

  const { token: code, hash } = newToken("");
  await db.insert(oauthAuthorizationCodes).values({
    code_hash: hash,
    client_id: check.client.id,
    user_id: userId,
    role,
    redirect_uri: check.redirectUri,
    code_challenge: check.params.code_challenge,
    resource: check.resource,
    expires_at: new Date(Date.now() + CODE_TTL_MS),
  });

  return withParams(check.redirectUri, { code, state: check.params.state });
}
