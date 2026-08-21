import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: ReturnType<typeof postgres> | undefined;
};

type TDatabase = ReturnType<typeof create>;

/**
 * Hyperdrive's connection string, when a binding is configured.
 *
 * Cloudflare's documented way to reach Postgres from a Worker: it holds the
 * pool globally, so an isolate gets a warm connection instead of paying a TLS
 * handshake and a fresh Postgres connection on every request. Without it each
 * isolate opens its own, and a Worker under any real traffic exhausts the
 * database's connection limit.
 *
 * Read off `globalThis.__env__`, which Nitro's Cloudflare handler sets to the
 * Worker's `env` on every invocation. Absent everywhere else (local `vite dev`,
 * tests), where `DATABASE_URL` is used directly.
 */
function hyperdriveUrl(): string | undefined {
  const bindings = (
    globalThis as unknown as {
      __env__?: { HYPERDRIVE?: { connectionString?: string } };
    }
  ).__env__;
  return bindings?.HYPERDRIVE?.connectionString;
}

function create() {
  const conn =
    globalForDb.conn ??
    postgres(hyperdriveUrl() ?? env.DATABASE_URL, {
      /**
       * Workers cap how many concurrent external connections one invocation may
       * open, and postgres.js defaults to 10 — over that cap. This is the
       * single most load-bearing option here: it is invisible in `wrangler dev`
       * (which uses the machine's real sockets) and fails in production, where
       * the symptom is a query that never completes and, through Better Auth, a
       * bare `FAILED_TO_GET_SESSION`.
       */
      max: 5,
      /**
       * `fetch_types` is deliberately left on. Cloudflare's example disables it
       * to save a round trip, but that is only safe for a schema with no array
       * columns — `learning_profiles.w`, `.learning_steps` and
       * `.relearning_steps` are `real[]`/`text[]`, and postgres.js needs the
       * type OIDs to encode them.
       */
    });
  if (env.NODE_ENV !== "production") globalForDb.conn = conn;
  return drizzle(conn, { schema });
}

let cached: TDatabase | undefined;

/**
 * The database, connected on first use rather than at import.
 *
 * Deferred for the same reason `env` is (see src/env.ts): on Workers there is
 * no connection string to read at module scope, and opening a socket while the
 * isolate is still starting is not something a Worker can do anyway.
 *
 * Methods are bound to the real client so `db.select()` and friends keep their
 * receiver through the proxy.
 */
export const db: TDatabase = new Proxy({} as TDatabase, {
  get(_target, prop) {
    cached ??= create();
    const value = cached[prop as keyof TDatabase];
    return typeof value === "function" ? value.bind(cached) : value;
  },
});
