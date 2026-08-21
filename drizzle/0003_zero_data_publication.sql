-- The one thing drizzle-kit cannot model, so the one thing it cannot generate:
-- the replication publication zero-cache reads. `drizzle-kit generate --custom`
-- scaffolds this file and its journal entry; only the SQL below is written by
-- hand.
--
-- Zero replicates only the tables clients sync. A dedicated publication keeps
-- the Better Auth tables ("user", "session", "account", "verification") out of
-- the replication stream entirely, so a session token can never reach a client
-- replica. zero-cache is pointed at it with ZERO_APP_PUBLICATIONS=zero_data,
-- and it has to list exactly the set in src/zero/schema.ts: a table Zero syncs
-- but this omits reaches the client as a permanently empty view.
--
-- This is pure DDL. It creates no table, drops no column and rewrites no row;
-- Postgres only starts recording changes to these four tables in the WAL for
-- whoever subscribes. Requires wal_level=logical on the instance.
--
-- The array columns on "learning_profiles" (w real[], learning_steps text[],
-- relearning_steps text[]) need no conversion: zero-cache maps a pg array to a
-- JSON value and carries the element type through replication, so they sync
-- and round-trip as-is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'zero_data') THEN
    CREATE PUBLICATION zero_data
      FOR TABLE "decks", "cards", "learning_profiles", "review_logs";
  END IF;
END
$$;
