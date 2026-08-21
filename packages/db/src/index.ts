import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

export * from "./schema.ts";
export { schema };

/**
 * One Postgres client per process, built once at startup.
 *
 * This used to be one client per *request*, with a pool of exactly one
 * connection, closed in a `finally`. That was not a database decision: it was
 * a Cloudflare Workers one. Workerd binds an outbound TCP socket to the request
 * that opened it and rejects any later request that reuses it, so a
 * module-scope pool eventually threw on a socket it had every right to keep.
 * The server runs on Railway now, as an ordinary long-lived Node process, where
 * a shared pool is simply the correct shape — connections are established once
 * rather than per request, and Postgres stops seeing a connect/disconnect for
 * every page load.
 */
export function createDatabase(url: string) {
  const sql = postgres(url, {
    // Idempotent DDL in the migrations is chatty and says nothing useful.
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema }) };
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type Sql = ReturnType<typeof createDatabase>["sql"];
