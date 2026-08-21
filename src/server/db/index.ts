import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import * as schema from "./schema";
import { withRequestResource } from "./resource";

/**
 * Create the database resources for one server request.
 *
 * Cloudflare associates outbound TCP sockets with the request that created
 * them. A Postgres.js instance owns a socket pool, so keeping it in module or
 * isolate state eventually makes a later request reuse an earlier request's
 * socket. Workerd rejects that cross-request I/O.
 *
 * Direct Postgres deliberately uses one connection per invocation. Postgres.js
 * queues concurrent queries on it, which stays below Workers' connection limit
 * and avoids multiplying Railway connections for a single HTTP request.
 */
export function createDatabase() {
  const sql = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql, { schema });

  return {
    db,
    close: () => sql.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];

/**
 * Run one request with one database client and always release its TCP socket.
 * Route handlers are the request boundary in TanStack Start, so every handler
 * that can touch Postgres enters through this helper.
 */
export async function withDatabase<T>(
  run: (db: Database) => Promise<T>,
): Promise<T> {
  return withRequestResource(createDatabase, ({ db }) => run(db));
}
