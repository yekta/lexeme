import { sql } from "drizzle-orm";

import type { db } from "@/server/db";

type Database = typeof db;
type DrizzleTx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * The Postgres transaction id of the currently open transaction. Mutations
 * return this to the client so Electric collections can `awaitTxId(txid)` —
 * i.e. hold the optimistic row until the very transaction that wrote it
 * arrives back over the shape stream.
 *
 * Must be called inside the same `db.transaction` as the writes; a separate
 * transaction would yield a different (never-syncing) txid.
 */
export async function generateTxId(tx: DrizzleTx): Promise<number> {
  const rows = await tx.execute<{ txid: string }>(
    sql`SELECT pg_current_xact_id()::xid::text AS txid`,
  );
  const txid = rows[0]?.txid;
  if (txid === undefined) {
    throw new Error("Failed to read the current Postgres transaction id.");
  }
  return Number.parseInt(txid, 10);
}
