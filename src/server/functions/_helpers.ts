import { getRequest } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

/** The transaction handle drizzle passes to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolve the Better Auth session for the current server-function request.
 * Throws (→ 401-ish) when there is no authenticated user. This is the real
 * security boundary for writes — never trust a `user_id` sent by the client.
 */
export async function requireUserId(): Promise<string> {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user.id;
}

/**
 * Read the Postgres transaction id, cast the way ElectricSQL reports it in
 * change-message headers. MUST be called inside the same transaction as the
 * write, otherwise `collection.utils.awaitTxId` will never resolve.
 */
export async function readTxid(tx: Tx): Promise<number> {
  const rows = await tx.execute<{ txid: string }>(
    sql`SELECT pg_current_xact_id()::xid::text AS txid`,
  );
  const row = (rows as unknown as Array<{ txid: string }>)[0];
  if (!row) throw new Error("Failed to read transaction id");
  return Number(row.txid);
}
