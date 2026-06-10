"use client";

import type { Transaction, PendingMutation } from "@tanstack/db";
import {
  startOfflineExecutor,
  type OfflineExecutor,
} from "@tanstack/offline-transactions";
import { TRPCClientError } from "@trpc/client";

import {
  cardsCollection,
  decksCollection,
  learningProfilesCollection,
  reviewLogsCollection,
  type CardRow,
  type DeckRow,
  type ReviewLogRow,
} from "@/db/collections";
import { trpc } from "@/trpc/vanilla";

/**
 * Durable write layer. Every mutation is recorded in an IndexedDB outbox the
 * instant it's made, *before* the server call. If the tab closes (or the
 * network is down) mid-flight, the outbox survives; on the next load the
 * executor replays the queued mutations to Postgres. This is what makes
 * optimistic changes safe to make offline — see also the SQLite read-cache in
 * `persistence.ts`, which is a separate concern (caching synced reads).
 *
 * Writes are driven by `transaction.mutations` rather than the action's
 * variables, because only the mutations are durably serialized (and the
 * serializer preserves `Date` values across a reload — metadata does not).
 */

/** Row carried by an optimistic mutation (always defined for insert/update). */
type Mutated<T> = PendingMutation & { modified: T };

/** What a server mutationFn receives — a narrow view of the offline params. */
type MutationFn = (params: {
  transaction: { mutations: Array<PendingMutation> };
  idempotencyKey: string;
}) => Promise<unknown>;

const mutationsFor = (tx: { mutations: Array<PendingMutation> }, id: string) =>
  tx.mutations.filter((m) => m.collection.id === id);

// A replayed delete may land after the row is already gone (e.g. the server
// committed it but the tab closed before the outbox entry cleared). Treat a
// NOT_FOUND from such a retry as success so it drains instead of error-looping.
function ignoreNotFound(error: unknown): void {
  if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
    return;
  }
  throw error;
}

// After the server confirms a write, we promote the row we already have into
// the collection's synced store with writeUpsert/writeDelete — a local write,
// no refetch. This is what keeps rating fast: a study session of 20 cards used
// to pull the whole cards + review-logs lists 20 times (the executor drains the
// outbox one transaction at a time). Now each rate is just its own small POST.
// The synced baseline ends up holding the client-computed values; a natural
// refetch on reload reconciles any server-side defaults (e.g. timestamps).
function syncedDelete(
  collection: { utils: { writeDelete: (key: string) => void } },
  key: string,
): void {
  try {
    collection.utils.writeDelete(key);
  } catch {
    // Already absent from the synced store (e.g. a replayed delete) — fine.
  }
}

const mutationFns = {
  createDeck: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    for (const m of rows) {
      const d = m.modified;
      await trpc.decks.create.mutate({
        id: d.id,
        name: d.name,
        description: d.description,
        learning_profile_id: d.learning_profile_id,
      });
    }
    decksCollection.utils.writeUpsert(rows.map((m) => m.modified));
  },

  updateDeck: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    for (const m of rows) {
      const d = m.modified;
      await trpc.decks.update.mutate({
        id: d.id,
        name: d.name,
        description: d.description,
        learning_profile_id: d.learning_profile_id,
      });
    }
    decksCollection.utils.writeUpsert(rows.map((m) => m.modified));
  },

  deleteDeck: async ({ transaction }) => {
    for (const m of mutationsFor(transaction, "decks")) {
      await trpc.decks.delete
        .mutate({ id: m.key as string })
        .catch(ignoreNotFound);
      syncedDelete(decksCollection, m.key as string);
    }
  },

  // Shared by single-card creates and bulk imports. Grouped by deck so a
  // multi-card insert hits the server once per deck (matches the old handler).
  insertCards: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const byDeck = new Map<string, { id: string; front: string; back: string }[]>();
    for (const m of rows) {
      const c = m.modified;
      const list = byDeck.get(c.deck_id) ?? [];
      list.push({ id: c.id, front: c.front, back: c.back });
      byDeck.set(c.deck_id, list);
    }
    await Promise.all(
      [...byDeck.entries()].map(([deckId, cards]) =>
        trpc.cards.create.mutate({ deckId, cards }),
      ),
    );
    cardsCollection.utils.writeUpsert(rows.map((m) => m.modified));
  },

  updateCard: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    for (const m of rows) {
      const c = m.modified;
      await trpc.cards.update.mutate({ id: c.id, front: c.front, back: c.back });
    }
    cardsCollection.utils.writeUpsert(rows.map((m) => m.modified));
  },

  deleteCard: async ({ transaction }) => {
    for (const m of mutationsFor(transaction, "cards")) {
      await trpc.cards.delete
        .mutate({ id: m.key as string })
        .catch(ignoreNotFound);
      syncedDelete(cardsCollection, m.key as string);
    }
  },

  // Deck + its cards committed atomically server-side. The transaction carries
  // one decks insert and N cards inserts.
  importDeck: async ({ transaction }) => {
    const [deck] = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    if (!deck) return;
    const d = deck.modified;
    const cardMuts = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    await trpc.decks.import.mutate({
      id: d.id,
      name: d.name,
      description: d.description,
      learning_profile_id: d.learning_profile_id,
      cards: cardMuts.map((m) => ({
        id: m.modified.id,
        front: m.modified.front,
        back: m.modified.back,
      })),
    });
    decksCollection.utils.writeUpsert(d);
    if (cardMuts.length > 0) {
      cardsCollection.utils.writeUpsert(cardMuts.map((m) => m.modified));
    }
  },

  // FSRS is computed client-side; this just persists the card patch + review
  // log it produced. Both ride the optimistic mutations (Dates intact across a
  // reload), so the full server payload is reconstructed from them here.
  rateCard: async ({ transaction }) => {
    const [cardMut] = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const [logMut] = mutationsFor(
      transaction,
      "review_logs",
    ) as Mutated<RateLogRow>[];
    if (!cardMut || !logMut) return;
    const c = cardMut.modified;
    const l = logMut.modified;
    await trpc.cards.rate.mutate({
      cardId: c.id,
      reviewLogId: l.id,
      durationMs: l.duration_ms,
      card: {
        due: c.due,
        stability: c.stability,
        difficulty: c.difficulty,
        scheduled_days: c.scheduled_days,
        reps: c.reps,
        lapses: c.lapses,
        state: c.state,
        learning_steps: c.learning_steps,
        last_review: c.last_review,
      },
      log: {
        rating: l.rating,
        state: l.state,
        due: l.due,
        stability: l.stability,
        difficulty: l.difficulty,
        scheduled_days: l.scheduled_days,
        learning_steps: l.learning_steps,
        review: l.review,
      },
    });
    // Promote both rows into the synced store locally — no list refetch.
    cardsCollection.utils.writeUpsert(c);
    reviewLogsCollection.utils.writeUpsert({
      id: l.id,
      card_id: l.card_id,
      state: l.state,
      duration_ms: l.duration_ms,
      review: l.review,
    });
  },
} satisfies Record<string, MutationFn>;

export type MutationFnName = keyof typeof mutationFns;

/**
 * The review-log shape carried by the rate mutation. Wider than `ReviewLogRow`
 * (which only surfaces what the server lists) — the extra FSRS fields exist
 * just long enough to build the `rate` payload, then the post-rate refetch
 * normalizes the row back to `ReviewLogRow`.
 */
export type RateLogRow = ReviewLogRow & {
  rating: number;
  due: Date;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
};

let executor: OfflineExecutor | undefined;

/** The browser-only outbox executor, created on first use. */
function getExecutor(): OfflineExecutor | undefined {
  if (typeof window === "undefined") return undefined;
  executor ??= startOfflineExecutor({
    collections: {
      decks: decksCollection,
      cards: cardsCollection,
      learning_profiles: learningProfilesCollection,
      review_logs: reviewLogsCollection,
    },
    mutationFns,
  });
  return executor;
}

/**
 * Start the executor and replay any outbox entries left over from a previous
 * session. Call once on app mount (alongside `preloadCollections`).
 */
export function startOutboxReplay(): void {
  void getExecutor()?.waitForInit();
}

/** A write that applies `onMutate` optimistically and durably queues the server call. */
export type OfflineAction<T> = (variables: T) => Transaction;

/**
 * Build a durable write. `onMutate` must be synchronous and apply the
 * optimistic change to the collections; `name` selects the server mutationFn.
 */
export function offlineAction<T>(
  name: MutationFnName,
  onMutate: (variables: T) => void,
): OfflineAction<T> {
  let action: OfflineAction<T> | undefined;
  return (variables) => {
    const ex = getExecutor();
    if (!ex) {
      throw new Error("Offline executor is unavailable outside the browser.");
    }
    action ??= ex.createOfflineAction<T>({ mutationFnName: name, onMutate });
    return action(variables);
  };
}
