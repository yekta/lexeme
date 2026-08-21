import { existsSync } from "node:fs";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

// Dev convenience: pick up a server-local .env, then the repo-root one, with
// anything already exported winning. Production sets real environment
// variables and neither file exists.
for (const candidate of [".env", "../../.env"]) {
  if (existsSync(candidate)) process.loadEnvFile(candidate);
}

/**
 * Server configuration, validated at boot.
 *
 * This used to be a lazy Proxy resolved on first property access, because on
 * Cloudflare Workers `process.env` is empty at module scope and only fills in
 * when a request arrives, so validating at import failed on a perfectly
 * configured deployment. The server is an ordinary Node process now, so the
 * environment is there before the first line runs and validation belongs at
 * startup: a missing DATABASE_URL should refuse to boot loudly rather than
 * surface as a 500 on whichever request happens to touch it first.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Railway injects PORT; 3001 locally, which is what the web dev server proxies to. */
    PORT: z.coerce.number().int().default(3001),

    DATABASE_URL: z.url(),

    BETTER_AUTH_SECRET: z.string().min(32),
    /** Public base URL of this API, where Google sends the OAuth callback. */
    BETTER_AUTH_URL: z.url(),
    /**
     * Where the browser app is served from. Two jobs: the CORS allow-list, and
     * Better Auth's trusted origins, which is what lets the sign-in call name a
     * `callbackURL` back on the web app rather than on the API.
     */
    WEB_ORIGIN: z.url(),

    GOOGLE_AUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_AUTH_CLIENT_SECRET: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),

    /**
     * Registrable parent domain the session cookie is issued for, e.g.
     * `.lexeme.fyi`.
     *
     * Required in any deployment where the web app, this API and zero-cache are
     * separate hosts: the browser has to send the cookie to the API, and
     * zero-cache authenticates by forwarding that same cookie to
     * `/api/zero/*`, so it has to be visible on all three subdomains.
     *
     * Left unset in local dev, where the web dev server proxies `/api` and
     * everything is one origin.
     */
    COOKIE_DOMAIN: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});

export type TEnv = typeof env;
