import { createCollection } from "@tanstack/react-db";
import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence";
import { queryCollectionOptions } from "@tanstack/query-db-collection";

import { persistence } from "@/db/persistence";
import { getQueryClient } from "@/trpc/query-client";
import { trpc } from "@/trpc/vanilla";
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
 * v2: reads moved from Electric shape streams to tRPC query collections.
 */
const SCHEMA_VERSION = 2;

/**
 * Reads are TanStack DB query collections over the tRPC `list` procedures:
 * each refetch replaces the collection with the full per-user table. There is
 * no sync server — freshness comes from explicit triggers (after every outbox
 * write, on focus/reconnect, and cross-tab pings; see db/refresh.ts).
 * superjson on the tRPC link keeps timestamptz columns as real `Date`s, which
 * FSRS scheduling and the study queue rely on.
 */

/**
 * Wrap collection options with SQLite persistence when the browser supports
 * it (see db/persistence.ts), so rows survive reloads and render from disk
 * before the first refetch lands. Falls back to plain in-memory otherwise.
 * The cast keeps the query-collection utils (`refetch`) visible on the
 * collection.
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
    queryCollectionOptions({
      id: "decks",
      queryKey: ["collections", "decks"],
      queryFn: () => trpc.decks.list.query(),
      queryClient: getQueryClient(),
      getKey: (row) => row.id,
    }),
  ),
);

/** Every card the user owns, across all decks — FSRS state plus content. */
export const cardsCollection = createCollection(
  maybePersisted(
    queryCollectionOptions({
      id: "cards",
      queryKey: ["collections", "cards"],
      queryFn: () => trpc.cards.list.query(),
      queryClient: getQueryClient(),
      getKey: (row) => row.id,
    }),
  ),
);

/** The user's learning (FSRS) profiles. */
export const learningProfilesCollection = createCollection(
  maybePersisted(
    queryCollectionOptions({
      id: "learning_profiles",
      queryKey: ["collections", "learning_profiles"],
      queryFn: () => trpc.learningProfiles.list.query(),
      queryClient: getQueryClient(),
      getKey: (row) => row.id,
    }),
  ),
);

/**
 * The user's full review history. Insert-only through the rate transaction,
 * but card/deck deletes cascade into it server-side — which is why it
 * full-refetches like the others instead of using an insert cursor.
 */
export const reviewLogsCollection = createCollection(
  maybePersisted(
    queryCollectionOptions({
      id: "review_logs",
      queryKey: ["collections", "review_logs"],
      queryFn: () => trpc.reviewLogs.list.query(),
      queryClient: getQueryClient(),
      getKey: (row) => row.id,
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

export type RefetchableCollection = {
  utils: { refetch: (opts?: { throwOnError?: boolean }) => Promise<unknown> };
};

/**
 * Pull the current server state into the given collections. Failures are
 * swallowed: every caller treats this as best-effort sync-back — the data
 * lands on the next trigger instead.
 */
export async function refetchCollections(
  collections: Array<RefetchableCollection>,
): Promise<void> {
  await Promise.all(
    collections.map((c) => c.utils.refetch().catch(() => {})),
  );
}

export const allCollections = [
  decksCollection,
  cardsCollection,
  learningProfilesCollection,
  reviewLogsCollection,
];

type RestartableCollection = {
  cleanup: () => Promise<void>;
  preload: () => Promise<void>;
};

/**
 * Tear a collection down and start it again — the error-recovery path when a
 * collection's query lands in an error state (a healthy one just refetches).
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
