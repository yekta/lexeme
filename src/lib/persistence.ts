import {
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  type PersistedCollectionPersistence,
} from "@tanstack/browser-db-sqlite-persistence";

let persistencePromise: Promise<PersistedCollectionPersistence> | null = null;

/**
 * Lazily open the OPFS-backed SQLite database that every collection persists
 * into. This is the local "source of truth" the app reads on startup — it
 * makes the app instant and fully offline-capable.
 *
 * Browser-only: OPFS does not exist during SSR, so only call this on the client.
 */
export function getPersistence(): Promise<PersistedCollectionPersistence> {
  if (!persistencePromise) {
    persistencePromise = openBrowserWASQLiteOPFSDatabase({
      databaseName: "lexeme.sqlite3",
    }).then((database) => createBrowserWASQLitePersistence({ database }));
  }
  return persistencePromise;
}
