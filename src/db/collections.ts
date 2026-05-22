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
    onInsert: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        const d = m.modified;
        await trpc.decks.create.mutate({
          id: d.id,
          name: d.name,
          description: d.description,
          learning_profile_id: d.learning_profile_id,
        });
      }
    },
    onUpdate: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        const d = m.modified;
        await trpc.decks.update.mutate({
          id: d.id,
          name: d.name,
          description: d.description,
          learning_profile_id: d.learning_profile_id,
        });
      }
    },
    onDelete: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await trpc.decks.delete.mutate({ id: m.key });
      }
    },
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
    onInsert: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        const c = m.modified;
        await trpc.cards.create.mutate({
          id: c.id,
          deckId: c.deck_id,
          front: c.front,
          back: c.back,
        });
      }
    },
    // Direct card updates only ever carry content edits — review scheduling
    // goes through the rate transaction (see use-rate-card.ts), which bypasses
    // this handler.
    onUpdate: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        const c = m.modified;
        await trpc.cards.update.mutate({
          id: c.id,
          front: c.front,
          back: c.back,
        });
      }
    },
    onDelete: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await trpc.cards.delete.mutate({ id: m.key });
      }
    },
  }),
);

/** The user's learning (FSRS) profiles. */
export const learningProfilesCollection = createCollection(
  queryCollectionOptions({
    id: "learning-profiles",
    queryKey: ["learning-profiles"],
    queryFn: () => trpc.learningProfiles.list.query(),
    queryClient,
    enabled,
    staleTime: Infinity,
    getKey: (row) => row.id,
    onInsert: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await trpc.learningProfiles.create.mutate({
          id: m.modified.id,
          name: m.modified.name,
        });
      }
    },
    onUpdate: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await trpc.learningProfiles.update.mutate({
          id: m.key,
          ...m.changes,
        });
      }
    },
    onDelete: async ({ transaction }) => {
      for (const m of transaction.mutations) {
        await trpc.learningProfiles.delete.mutate({ id: m.key });
      }
    },
  }),
);

/**
 * The user's review logs since the start of today. Insert-only, and only ever
 * written through the rate transaction, so no mutation handlers are needed.
 */
export const reviewLogsCollection = createCollection(
  queryCollectionOptions({
    id: "review-logs",
    queryKey: ["review-logs"],
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
