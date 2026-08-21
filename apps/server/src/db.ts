import { createDatabase } from "@lexeme/db";
import { schema as zeroSchema } from "@lexeme/contracts";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

import { env } from "./env.ts";

export const { sql, db } = createDatabase(env.DATABASE_URL);

/**
 * ZQL-capable view of the same client, used by `/api/zero/mutate` to run the
 * shared mutators authoritatively inside a Postgres transaction.
 */
export const dbProvider = zeroDrizzle(zeroSchema, db);

// Types `tx.dbTransaction.wrappedTransaction` for the server branches of the
// shared mutators (see zero.ts). Module augmentation is ambient, so declaring
// it here is enough, nothing in the browser has to import this file.
declare module "@rocicorp/zero" {
  interface DefaultTypes {
    dbProvider: typeof dbProvider;
  }
}
