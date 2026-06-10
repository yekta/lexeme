import { createCollection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@/server/api/root";
import { getQueryClient } from "@/trpc/query-client";
import { trpc } from "@/trpc/vanilla";

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type DeckRow = RouterOutputs["decks"]["list"][number];
export type CardRow = RouterOutputs["cards"]["list"][number];
export type LearningProfileRow =
  RouterOutputs["learningProfiles"]["list"][number];
export type ReviewLogRow = RouterOutputs["reviewLogs"]["list"][number];

// Collections sync by calling the server; that only makes sense in the browser.
// On the server the collections stay idle and components render placeholders
// until the client takes over.
const enabled = typeof window !== "undefined";

const queryClient = getQueryClient();

/** Every deck the user owns. */
export const decksCollection = createCollection(
  queryCollectionOptions({
    id: "decks",
    queryKey: ["decks"],
    queryFn: () => trpc.decks.list.query(),
    queryClient,
    enabled,
    staleTime: Infinity,
    getKey: (row) => row.id,
    // Writes go through the durable outbox (see db/offline.ts), not collection
    // handlers — a handler here would double-write to the server.
  }),
);

/** Every card the user owns, across all decks — FSRS state plus content. */
export const cardsCollection = createCollection(
  queryCollectionOptions({
    id: "cards",
    queryKey: ["cards"],
    queryFn: () => trpc.cards.list.query(),
    queryClient,
    enabled,
    staleTime: Infinity,
    getKey: (row) => row.id,
    // Writes (create/import/update/rate/delete) go through the durable outbox
    // (see db/offline.ts), not collection handlers.
  }),
);

/** The user's learning (FSRS) profiles. */
export const learningProfilesCollection = createCollection(
  queryCollectionOptions({
    id: "learning_profiles",
    queryKey: ["learning_profiles"],
    queryFn: () => trpc.learningProfiles.list.query(),
    queryClient,
    enabled,
    staleTime: Infinity,
    getKey: (row) => row.id,
    // Read-only on the client today. Any future writes should go through the
    // durable outbox (see db/offline.ts), not a collection handler.
  }),
);

/**
 * The user's review logs since the start of today. Insert-only, and only ever
 * written through the rate transaction, so no mutation handlers are needed.
 */
export const reviewLogsCollection = createCollection(
  queryCollectionOptions({
    id: "review_logs",
    queryKey: ["review_logs"],
    queryFn: () => trpc.reviewLogs.list.query(),
    queryClient,
    enabled,
    staleTime: Infinity,
    getKey: (row) => row.id,
  }),
);

/** Kick off syncing for every collection (called once after the app mounts). */
export function preloadCollections() {
  void decksCollection.preload();
  void cardsCollection.preload();
  void learningProfilesCollection.preload();
  void reviewLogsCollection.preload();
}

/** Build a brand-new card row with the same FSRS defaults the database uses. */
export function newCardRow(input: {
  id: string;
  deckId: string;
  front: string;
  back: string;
}): CardRow {
  const now = new Date();
  return {
    id: input.id,
    deck_id: input.deckId,
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
    front: input.front,
    back: input.back,
    content_updated_at: now,
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

type QueryUtilsLike = {
  lastError: unknown;
  refetch: (opts?: { throwOnError?: boolean }) => Promise<unknown>;
};

/**
 * Normalise a `useLiveQuery` result + its source collection into the
 * `{ isPending, isError, error, refetch }` shape the page-level `dataStateOf`
 * helper expects — so live queries classify the same way tRPC queries did.
 */
export function liveStatus(
  lq: { isReady: boolean; isError: boolean },
  collection: { utils: QueryUtilsLike },
) {
  return {
    isPending: !lq.isReady && !lq.isError,
    isError: lq.isError,
    error: lq.isError ? collection.utils.lastError : undefined,
    refetch: () => {
      void collection.utils.refetch();
    },
  };
}
