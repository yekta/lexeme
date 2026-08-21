import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function buildEnv() {
  return createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_AUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_AUTH_CLIENT_SECRET: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    /**
     * Registrable parent domain the session cookie is issued for, e.g.
     * `.lexeme.fyi`. Set it in any deployment where zero-cache lives on a
     * sibling subdomain: zero-cache authenticates by forwarding the browser's
     * cookie to `/api/zero/*`, so the cookie has to be visible on
     * `zero.lexeme.fyi` as well as on the app's own host.
     *
     * Left unset in local dev, where app and zero-cache are both on localhost
     * and a domain attribute would only get in the way.
     */
    COOKIE_DOMAIN: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  clientPrefix: "VITE_",
  client: {},
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  });
}

type TEnv = ReturnType<typeof buildEnv>;

let cached: TEnv | undefined;

/**
 * Validated server env, resolved on first access rather than at import.
 *
 * Lazy because this runs on Cloudflare Workers, where `process.env` is
 * populated from the Worker's bindings when a request arrives — there is
 * nothing to read at module scope, so validating there fails on a correctly
 * configured deployment. It also keeps the SPA prerender working: rendering the
 * shell touches no server config, so it must not need a DATABASE_URL to exist.
 */
export const env: TEnv = new Proxy({} as TEnv, {
  get(_target, prop) {
    cached ??= buildEnv();
    return cached[prop as keyof TEnv];
  },
});
