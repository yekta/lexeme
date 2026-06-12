import { createCollection } from "@tanstack/react-db";
import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";

import { persistence } from "@/db/persistence";
import type {
  TCard,
  TDeck,
  TLearningProfile,
  TReviewLog,
} from "@/server/db/schema";

export type DeckRow = TDeck;
export type CardRow = TCard;
export type LearningProfileRow = TLearningProfile;
export type ReviewLogRow = TReviewLog;

/**
 * Bump to discard everything persisted locally and trigger a fresh sync
 * (do this whenever a synced table's shape changes incompatibly).
 */
const SCHEMA_VERSION = 1;

/**
 * Electric streams Postgres values as text; the default parser covers
 * numbers/bools/arrays but leaves timestamps as strings. FSRS scheduling and
 * the study queue do real Date math, so parse every timestamptz into a Date.
 */
const parser = {
  timestamptz: (value: string) => new Date(value),
};

/**
 * Shape requests go through our auth proxy (src/routes/api/electric/$table),
 * which pins the table + per-user where clause server-side. The URL is only
 * read when syncing starts, and that only happens in the browser — the
 * placeholder origin keeps module evaluation safe during SSR.
 */
function shapeUrl(table: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost";
  return new URL(`/api/electric/${table}`, origin).toString();
}

/**
 * Wrap Electric collection options with SQLite persistence when the browser
 * supports it (see db/persistence.ts), so synced rows survive reloads and the
 * stream resumes from disk. Falls back to plain in-memory sync otherwise.
 * The cast keeps the Electric utils (`awaitTxId`) visible on the collection.
 */
function maybePersisted<O extends object>(options: O): O {
  if (!persistence) return options;
  return persistedCollectionOptions({
    ...(options as O & { sync: never; getKey: never }),
    persistence,
    schemaVersion: SCHEMA_VERSION,
  }) as unknown as O;
}

/**
 * Every deck the user owns.
 * Writes go through the durable outbox (see db/offline.ts), not collection
 * handlers — a handler here would double-write to the server.
 */
export const decksCollection = createCollection(
  maybePersisted(
    electricCollectionOptions<DeckRow>({
      id: "decks",
      getKey: (row) => row.id,
      shapeOptions: { url: shapeUrl("decks"), parser },
    }),
  ),
);

/** Every card the user owns, across all decks — FSRS state plus content. */
export const cardsCollection = createCollection(
  maybePersisted(
    electricCollectionOptions<CardRow>({
      id: "cards",
      getKey: (row) => row.id,
      shapeOptions: { url: shapeUrl("cards"), parser },
    }),
  ),
);

/** The user's learning (FSRS) profiles. */
export const learningProfilesCollection = createCollection(
  maybePersisted(
    electricCollectionOptions<LearningProfileRow>({
      id: "learning_profiles",
      getKey: (row) => row.id,
      shapeOptions: { url: shapeUrl("learning_profiles"), parser },
    }),
  ),
);

/**
 * The user's full review history. Insert-only, and only ever written through
 * the rate transaction. Consumers filter to "today" client-side (the shape
 * has no moving date filter, so it stays stable and resumable).
 */
export const reviewLogsCollection = createCollection(
  maybePersisted(
    electricCollectionOptions<ReviewLogRow>({
      id: "review_logs",
      getKey: (row) => row.id,
      shapeOptions: { url: shapeUrl("review_logs"), parser },
    }),
  ),
);

/** Kick off syncing for every collection (called once after the app mounts). */
export function preloadCollections() {
  if (typeof window === "undefined") return;
  void decksCollection.preload();
  void cardsCollection.preload();
  void learningProfilesCollection.preload();
  void reviewLogsCollection.preload();
}

/** Build a brand-new card row with the same FSRS defaults the database uses. */
export function newCardRow(input: {
  id: string;
  deckId: string;
  userId: string;
  front: string;
  back: string;
}): CardRow {
  const now = new Date();
  return {
    id: input.id,
    deck_id: input.deckId,
    user_id: input.userId,
    front: input.front,
    back: input.back,
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    learning_steps: 0,
    last_review: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * True when a row has local optimistic mutations the server hasn't confirmed
 * yet. Reads TanStack DB's `$synced` virtual property, stamped at runtime on
 * every row emitted by a collection or live query (the typed row aliases
 * `TDeck`/`TCard` don't surface it, hence the `unknown` parameter).
 */
export function isRowOptimistic(row: unknown): boolean {
  return (row as { $synced?: boolean }).$synced === false;
}

type RestartableCollection = {
  cleanup: () => Promise<void>;
  preload: () => Promise<void>;
};

/**
 * Tear a collection down and start it again — the Electric equivalent of the
 * old query refetch, used as the error-recovery path. (A healthy collection
 * never needs this; the shape stream retries itself.)
 */
export function restartCollections(
  collections: Array<RestartableCollection>,
): void {
  for (const collection of collections) {
    void collection.cleanup().then(() => collection.preload());
  }
}

/**
 * Normalise a `useLiveQuery` result + its source collection into the
 * `{ isPending, isError, error, refetch }` shape the page-level `dataStateOf`
 * helper expects — so live queries classify the same way tRPC queries did.
 */
export function liveStatus(
  lq: { isReady: boolean; isError: boolean },
  collection: RestartableCollection,
) {
  return {
    isPending: !lq.isReady && !lq.isError,
    isError: lq.isError,
    error: lq.isError
      ? new Error("Syncing failed. Check your connection and retry.")
      : undefined,
    refetch: () => {
      restartCollections([collection]);
    },
  };
}
