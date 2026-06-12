"use client";

import {
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  type BrowserWASQLiteDatabase,
} from "@tanstack/browser-db-sqlite-persistence";
import type { PersistedCollectionPersistence } from "@tanstack/db-sqlite-persistence-core";

/**
 * Local-first storage for the Electric collections: a SQLite database in the
 * browser's origin-private file system (OPFS). Synced rows land here as they
 * stream in, so a reload renders from disk instantly and the shape stream
 * resumes from the stored offset instead of re-downloading everything.
 *
 * Persistence is strictly best-effort: when OPFS isn't available (old
 * browser, some private modes) the collections run un-persisted and the app
 * behaves exactly like before — first load syncs over the network.
 */

const DATABASE_NAME = "lexeme.sqlite";

let database: BrowserWASQLiteDatabase | undefined;
let persistence: PersistedCollectionPersistence | undefined;

if (typeof window !== "undefined") {
  try {
    database = await openBrowserWASQLiteOPFSDatabase({
      databaseName: DATABASE_NAME,
    });
    persistence = createBrowserWASQLitePersistence({ database });
  } catch (error) {
    console.warn(
      "Local persistence unavailable; falling back to in-memory sync.",
      error,
    );
    database = undefined;
    persistence = undefined;
  }
}

export { persistence };

/**
 * Delete all locally persisted data. Called on sign-out so the next user on
 * this device can't read the previous user's decks; the caller is expected to
 * do a full navigation afterwards (in-memory collection state dies with it).
 */
export async function wipeLocalPersistence(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await database?.close?.();
  } catch {
    // Closing is best-effort; removal below is what matters.
  }
  database = undefined;
  persistence = undefined;
  try {
    const root = await navigator.storage.getDirectory();
    // wa-sqlite keeps sidecar files (journal/wal) next to the database, so
    // remove every OPFS entry that belongs to it rather than one exact name.
    for await (const name of (
      root as unknown as { keys: () => AsyncIterable<string> }
    ).keys()) {
      if (name.startsWith(DATABASE_NAME)) {
        await root.removeEntry(name, { recursive: true }).catch(() => {});
      }
    }
  } catch {
    // No OPFS — nothing was persisted in the first place.
  }
}
