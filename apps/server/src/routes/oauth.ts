import { oauthAuthorizeParams } from "@lexeme/contracts";
import { oauthClients } from "@lexeme/db";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

import { checkAuthorizeRequest } from "../oauth/authorize.ts";
import { isAllowedRedirectUri } from "../oauth/rules.ts";
import {
  OAuthTokenError,
  exchangeAuthorizationCode,
  exchangeRefreshToken,
} from "../oauth/token.ts";
import { db } from "../db.ts";
import { CONSENT_PAGE_URL, ISSUER, MCP_RESOURCE } from "../urls.ts";

const registerRequest = z.looseObject({
  client_name: z.string().trim().max(100).optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
});

const protectedResourceMetadata = {
  resource: MCP_RESOURCE,
  resource_name: "Lexeme",
  authorization_servers: [ISSUER],
  bearer_methods_supported: ["header"],
};

const authorizationServerMetadata = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  registration_endpoint: `${ISSUER}/oauth/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  authorization_response_iss_parameter_supported: true,
};

function oauthError(c: Context, error: string, description: string, status: 400 | 401 = 400) {
  c.header("Cache-Control", "no-store");
  return c.json({ error, error_description: description }, status);
}

async function readForm(c: Context): Promise<Record<string, string | undefined>> {
  const isJson = c.req.header("content-type")?.includes("application/json");
  const body = isJson ? await c.req.json().catch(() => ({})) : await c.req.parseBody();
  const fields: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

/**
 * The OAuth 2.1 authorization server MCP clients sign in through. Public
 * clients only, with PKCE; the user picks a role on the web app's consent page.
 * Mounted at the root because clients discover it from `/.well-known`.
 */
export const oauthRoutes = new Hono()
  .use("/.well-known/*", cors({ origin: "*" }))
  .use("/oauth/register", cors({ origin: "*" }))
  .use("/oauth/token", cors({ origin: "*" }))
  .get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata))
  .get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(protectedResourceMetadata))
  .get("/.well-known/oauth-authorization-server", (c) => c.json(authorizationServerMetadata))
  .post("/oauth/register", async (c) => {
    const parsed = registerRequest.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return oauthError(c, "invalid_client_metadata", "redirect_uris is required (1 to 10 URIs).");
    }
    const invalid = parsed.data.redirect_uris.find((uri) => !isAllowedRedirectUri(uri));
    if (invalid) {
      return oauthError(
        c,
        "invalid_redirect_uri",
        `${invalid} isn't allowed. Use https, or http on localhost.`,
      );
    }

    const [client] = await db
      .insert(oauthClients)
      .values({
        name: parsed.data.client_name || "Unnamed app",
        redirect_uris: parsed.data.redirect_uris,
      })
      .returning();
    return c.json(
      {
        client_id: client.id,
        client_name: client.name,
        redirect_uris: client.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(client.created_at.getTime() / 1000),
      },
      201,
    );
  })
  .get("/oauth/authorize", async (c) => {
    const params = oauthAuthorizeParams.safeParse(c.req.query());
    if (!params.success) return c.text("This sign-in link is incomplete.", 400);

    const check = await checkAuthorizeRequest(params.data);
    if (!check.ok) {
      if (check.redirectUrl) return c.redirect(check.redirectUrl);
      return c.text(check.description, 400);
    }
    const query = new URL(c.req.url).search;
    return c.redirect(`${CONSENT_PAGE_URL}${query}`);
  })
  .post("/oauth/token", async (c) => {
    const form = await readForm(c);
    try {
      const tokens =
        form.grant_type === "authorization_code"
          ? await exchangeAuthorizationCode(form)
          : form.grant_type === "refresh_token"
            ? await exchangeRefreshToken(form)
            : undefined;
      if (!tokens) {
        return oauthError(c, "unsupported_grant_type", "Use authorization_code or refresh_token.");
      }
      c.header("Cache-Control", "no-store");
      return c.json(tokens);
    } catch (error) {
      if (!(error instanceof OAuthTokenError)) throw error;
      return oauthError(c, error.error, error.message);
    }
  });
