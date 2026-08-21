import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
  account,
  learningProfiles,
  session,
  user,
  verification,
} from "@lexeme/db";

import { db } from "./db.ts";
import { env } from "./env.ts";

/**
 * Better Auth, built once at startup.
 *
 * It used to be rebuilt per request, because Better Auth captures its adapter
 * on construction and a cached instance would have pinned a Postgres.js pool,
 * which on Cloudflare Workers meant a later request reusing an earlier
 * request's TCP socket, and workerd refusing it. On an ordinary Node process
 * there is nothing to avoid: one adapter over one pool for the life of the
 * server is the shape this was always working around.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  /**
   * The web app is a separate origin now, so the sign-in call names a
   * `callbackURL` that is not this server's. Better Auth origin-checks those
   * and refuses anything it was not told to trust.
   */
  trustedOrigins: [env.WEB_ORIGIN],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  // Map Better Auth's internal camelCase model fields to our snake_case schema.
  user: {
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
  },
  account: {
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  /**
   * Issue the session cookie for the parent domain when one is configured, so
   * all three hosts share it: the app on `lexeme.fyi`, this API on
   * `api.lexeme.fyi`, and zero-cache on `zero.lexeme.fyi`.
   *
   * Two things depend on it. The browser has to send the cookie to an API on a
   * different subdomain than the page. And zero-cache authenticates by
   * forwarding that same cookie to `/api/zero/query` and `/api/zero/mutate`;
   * without this it never sees one and every sync request 401s.
   *
   * They are sibling subdomains and therefore same-site, so the default
   * `SameSite=Lax` still applies, nothing here needs `SameSite=None`.
   *
   * Unset in dev, where the web dev server proxies `/api` and there is one
   * origin. Note that a Railway-style `*.up.railway.app` host cannot be used
   * for this: those are separate sites, not subdomains of a registrable one.
   */
  ...(env.COOKIE_DOMAIN
    ? {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.COOKIE_DOMAIN,
          },
        },
      }
    : {}),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_AUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_AUTH_CLIENT_SECRET,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await db.insert(learningProfiles).values({
            user_id: createdUser.id,
            name: "Default",
            is_default: true,
          });
        },
      },
    },
  },
});

export type Auth = typeof auth;
