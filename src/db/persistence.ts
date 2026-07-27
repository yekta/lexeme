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
 * Exactly one tab owns the database. The persistence package is single-tab
 * (SingleProcessCoordinator), and wa-sqlite's OPFSCoopSyncVFS deadlocks a
 * second opener: the first tab acquires the OPFS access handle at open
 * without ever registering the BroadcastChannel release-listener, so another
 * tab's open waits forever on its Web Lock — with this module's top-level
 * await, that hung the whole app until the first tab closed. Tabs race for a
 * lifetime Web Lock instead; the winner opens OPFS, every other tab runs
 * un-persisted (Electric still syncs them over the network). Revisit if
 * TanStack ships a multi-tab-safe open (BrowserCollectionCoordinator alone
 * doesn't fix it — its recipe still opens the database in every tab).
 *
 * Persistence stays strictly best-effort: no OPFS (old browser, some private
 * modes), not the owner, or a slow open — the collections run un-persisted
 * and the app behaves exactly like before.
 */

const DATABASE_NAME = "lexeme.sqlite";
const OWNER_LOCK_NAME = "lexeme:persistence-owner";
const WIPE_CHANNEL_NAME = "lexeme:wipe-persistence";
const OPEN_TIMEOUT_MS = 2_000;

let database: BrowserWASQLiteDatabase | undefined;
let persistence: PersistedCollectionPersistence | undefined;

/**
 * Try to become the persistence owner. The lock is held by a promise that
 * never resolves, so ownership lasts until the tab dies and the browser
 * releases it for the next tab. Browsers without Web Locks get the old
 * single-tab behavior.
 */
function acquireOwnership(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request(OWNER_LOCK_NAME, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        if (lock === null) return undefined;
        return new Promise<never>(() => {});
      })
      .catch(() => resolve(false));
  });
}

/** Open OPFS with a deadline so a wedged open can never block app boot. */
async function openDatabaseBounded(): Promise<
  BrowserWASQLiteDatabase | undefined
> {
  const opening = openBrowserWASQLiteOPFSDatabase({
    databaseName: DATABASE_NAME,
  });
  const opened = await Promise.race([
    opening,
    new Promise<undefined>((resolve) =>
      setTimeout(() => resolve(undefined), OPEN_TIMEOUT_MS),
    ),
  ]);
  if (!opened) {
    // A late success would squat on the OPFS handle — close it.
    void opening.then((db) => db.close?.()).catch(() => {});
  }
  return opened;
}

if (typeof window !== "undefined") {
  try {
    if (await acquireOwnership()) {
      database = await openDatabaseBounded();
      if (database) {
        persistence = createBrowserWASQLitePersistence({ database });
      } else {
        console.warn(
          "Local persistence timed out opening; falling back to in-memory sync.",
        );
      }
    } else {
      console.warn(
        "Another tab owns local persistence; falling back to in-memory sync.",
      );
    }
  } catch (error) {
    console.warn(
      "Local persistence unavailable; falling back to in-memory sync.",
      error,
    );
    database = undefined;
    persistence = undefined;
  }

  if (persistence) {
    // Sign-out can happen in a non-owner tab; only the owner can close the
    // database and free the OPFS handles that block file removal.
    new BroadcastChannel(WIPE_CHANNEL_NAME).onmessage = () => {
      void wipeLocalPersistence();
    };
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
    // Ask the owner tab (possibly not this one) to close and wipe too.
    new BroadcastChannel(WIPE_CHANNEL_NAME).postMessage("wipe");
  } catch {
    // No BroadcastChannel — this tab's best-effort wipe below still runs.
  }
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
