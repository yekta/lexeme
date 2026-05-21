import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Server-side environment. All secrets stay on the server: Electric shape
 * requests and writes are proxied through TanStack Start server routes/functions,
 * so the browser never sees DATABASE_URL or the Electric credentials.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    GOOGLE_AUTH_CLIENT_ID: z.string().min(1),
    GOOGLE_AUTH_CLIENT_SECRET: z.string().min(1),
    // Electric Cloud: base shape URL + source credentials.
    ELECTRIC_URL: z.url().default("https://api.electric-sql.cloud/v1/shape"),
    ELECTRIC_SOURCE_ID: z.string().min(1),
    ELECTRIC_SECRET: z.string().min(1),
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
