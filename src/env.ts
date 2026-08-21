import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
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
