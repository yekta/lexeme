import { persistedCollectionOptions } from "@tanstack/browser-db-sqlite-persistence";
import type { PersistedCollectionPersistence } from "@tanstack/browser-db-sqlite-persistence";
import {
  electricCollectionOptions,
  type ElectricCollectionUtils,
} from "@tanstack/electric-db-collection";
import { createCollection, type Collection } from "@tanstack/react-db";
import type {
  TCardContentRow,
  TCardRow,
  TDeckRow,
  TLearningProfileRow,
  TReviewLogRow,
} from "@/lib/db-types";
import {
  cardContentSchema,
  cardSchema,
  deckSchema,
  learningProfileSchema,
  reviewLogSchema,
} from "@/lib/electric-schemas";
import { getPersistence } from "@/lib/persistence";
import { deleteCardFn, updateCardContentFn } from "@/server/functions/cards";
import {
  createDeckFn,
  deleteDeckFn,
  updateDeckFn,
} from "@/server/functions/decks";
import {
  createLearningProfileFn,
  deleteLearningProfileFn,
  updateLearningProfileFn,
} from "@/server/functions/learning-profiles";

/**
 * The five Electric-synced, SQLite-persisted collections.
 *
 * Each collection: reads stream in from Postgres via the auth-aware shape proxy
 * and persist to OPFS SQLite; writes apply optimistically and call a server
 * function that returns a `txid` the collection waits to see synced back.
 *
 * Bump SCHEMA_VERSION to discard the local cache and re-sync from the server.
 */
const SCHEMA_VERSION = 1;

/**
 * The Electric `ShapeStream` builds its request with `new URL(url)`, which
 * needs an absolute URL. Collections are only ever built in the browser, so
 * the current origin is available.
 */
const shapeUrl = (table: string) =>
  `${window.location.origin}/api/shapes/${table}`;

/**
 * `persistedCollectionOptions` widens `schema` to optional, which doesn't line
 * up with `createCollection`'s present-or-absent overloads. Route through this
 * helper, which re-asserts the row + Electric-utils types.
 */
type ElectricUtils = ElectricCollectionUtils<Record<string, unknown>>;

function makeCollection<TRow extends object>(
  options: unknown,
): Collection<TRow, string, ElectricUtils> {
  return createCollection(options as never) as unknown as Collection<
    TRow,
    string,
    ElectricUtils
  >;
}

function buildCollections(persistence: PersistedCollectionPersistence) {
  const decks = makeCollection<TDeckRow>(
    persistedCollectionOptions({
      persistence,
      schemaVersion: SCHEMA_VERSION,
      ...electricCollectionOptions({
        id: "decks",
        schema: deckSchema,
        shapeOptions: { url: shapeUrl("decks") },
        getKey: (row) => row.id,
        onInsert: async ({ transaction }) => {
          const r = transaction.mutations[0]!.modified;
          const { txid } = await createDeckFn({
            data: {
              id: r.id,
              name: r.name,
              description: r.description,
              learning_profile_id: r.learning_profile_id,
              created_at: r.created_at,
              updated_at: r.updated_at,
            },
          });
          return { txid };
        },
        onUpdate: async ({ transaction }) => {
          const r = transaction.mutations[0]!.modified;
          const { txid } = await updateDeckFn({
            data: {
              id: r.id,
              name: r.name,
              description: r.description,
              learning_profile_id: r.learning_profile_id,
              updated_at: r.updated_at,
            },
          });
          return { txid };
        },
        onDelete: async ({ transaction }) => {
          const r = transaction.mutations[0]!.original;
          const { txid } = await deleteDeckFn({ data: { id: r.id } });
          return { txid };
        },
      }),
    }),
  );

  const cards = makeCollection<TCardRow>(
    persistedCollectionOptions({
      persistence,
      schemaVersion: SCHEMA_VERSION,
      ...electricCollectionOptions({
        id: "cards",
        schema: cardSchema,
        shapeOptions: { url: shapeUrl("cards") },
        getKey: (row) => row.id,
        // Inserts (create card) and updates (rate card) go through compound
        // actions in lib/actions.ts; only direct deletes use a handler.
        onDelete: async ({ transaction }) => {
          const r = transaction.mutations[0]!.original;
          const { txid } = await deleteCardFn({ data: { id: r.id } });
          return { txid };
        },
      }),
    }),
  );

  const cardContents = makeCollection<TCardContentRow>(
    persistedCollectionOptions({
      persistence,
      schemaVersion: SCHEMA_VERSION,
      ...electricCollectionOptions({
        id: "card_contents",
        schema: cardContentSchema,
        shapeOptions: { url: shapeUrl("card_contents") },
        getKey: (row) => row.id,
        onUpdate: async ({ transaction }) => {
          const r = transaction.mutations[0]!.modified;
          const { txid } = await updateCardContentFn({
            data: {
              card_id: r.card_id,
              front: r.front,
              back: r.back,
              updated_at: r.updated_at,
            },
          });
          return { txid };
        },
      }),
    }),
  );

  const learningProfiles = makeCollection<TLearningProfileRow>(
    persistedCollectionOptions({
      persistence,
      schemaVersion: SCHEMA_VERSION,
      ...electricCollectionOptions({
        id: "learning_profiles",
        schema: learningProfileSchema,
        shapeOptions: { url: shapeUrl("learning_profiles") },
        getKey: (row) => row.id,
        onInsert: async ({ transaction }) => {
          const r = transaction.mutations[0]!.modified;
          const { txid } = await createLearningProfileFn({
            data: {
              id: r.id,
              name: r.name,
              created_at: r.created_at,
              updated_at: r.updated_at,
            },
          });
          return { txid };
        },
        onUpdate: async ({ transaction }) => {
          const r = transaction.mutations[0]!.modified;
          const { txid } = await updateLearningProfileFn({
            data: {
              id: r.id,
              name: r.name,
              new_cards_per_day: r.new_cards_per_day,
              max_reviews_per_day: r.max_reviews_per_day,
              request_retention: r.request_retention,
              maximum_interval: r.maximum_interval,
              w: r.w,
              enable_fuzz: r.enable_fuzz,
              enable_short_term: r.enable_short_term,
              learning_steps: r.learning_steps,
              relearning_steps: r.relearning_steps,
              updated_at: r.updated_at,
            },
          });
          return { txid };
        },
        onDelete: async ({ transaction }) => {
          const r = transaction.mutations[0]!.original;
          const { txid } = await deleteLearningProfileFn({
            data: { id: r.id },
          });
          return { txid };
        },
      }),
    }),
  );

  const reviewLogs = makeCollection<TReviewLogRow>(
    persistedCollectionOptions({
      persistence,
      schemaVersion: SCHEMA_VERSION,
      ...electricCollectionOptions({
        id: "review_logs",
        schema: reviewLogSchema,
        shapeOptions: { url: shapeUrl("review_logs") },
        getKey: (row) => row.id,
        // Review logs are only ever inserted via the rate-card action.
      }),
    }),
  );

  return { decks, cards, cardContents, learningProfiles, reviewLogs };
}

export type AppCollections = ReturnType<typeof buildCollections>;

let collections: AppCollections | null = null;

/** Build (once) the persisted Electric collections. Browser-only. */
export async function initCollections(): Promise<AppCollections> {
  if (!collections) collections = buildCollections(await getPersistence());
  return collections;
}

/** Access the already-initialised collections. `DbProvider` guarantees this. */
export function getCollections(): AppCollections {
  if (!collections) {
    throw new Error("Collections not initialised — DbProvider must mount first.");
  }
  return collections;
}
