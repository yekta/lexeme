import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: ReturnType<typeof postgres> | undefined;
};

type TDatabase = ReturnType<typeof create>;

function create() {
  const conn = globalForDb.conn ?? postgres(env.DATABASE_URL);
  if (env.NODE_ENV !== "production") globalForDb.conn = conn;
  return drizzle(conn, { schema });
}

let cached: TDatabase | undefined;

/**
 * The database, connected on first use rather than at import.
 *
 * Deferred for the same reason `env` is (see src/env.ts): on Workers there is
 * no connection string to read at module scope, and opening a socket while the
 * isolate is still starting is not something a Worker can do anyway. It also
 * keeps the SPA prerender working — rendering the shell imports every server
 * route, and none of them should need a live Postgres connection to do it.
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
