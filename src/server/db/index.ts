import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { env } from "@/env";
import * as schema from "./schema";

// The app runs on the Cloudflare Workers runtime (workerd), where a socket
// opened in one request can't be reused in another. postgres.js keeps a
// long-lived pooled connection and breaks here, so we use Neon's serverless
// driver instead. Simple queries go over stateless HTTP (poolQueryViaFetch);
// transactions open a short-lived WebSocket that lives and dies inside a single
// request. workerd provides a global WebSocket, which Neon uses automatically.
neonConfig.poolQueryViaFetch = true;

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const pool =
  globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
