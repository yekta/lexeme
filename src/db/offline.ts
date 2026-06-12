"use client";

import type { Transaction, PendingMutation } from "@tanstack/db";
import {
  NonRetriableError,
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
 * optimistic changes safe to make offline.
 *
 * Writes are driven by `transaction.mutations` rather than the action's
 * variables, because only the mutations are durably serialized (and the
 * serializer preserves `Date` values across a reload — metadata does not).
 *
 * Confirmation comes from Electric, not from us: each tRPC mutation commits
 * in one Postgres transaction and returns its txid, and `awaitTxId` holds the
 * optimistic state until that transaction arrives back over the shape stream.
 * No manual `writeUpsert`/refetch — the stream is the source of truth.
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

type AwaitableCollection = {
  utils: { awaitTxId: (txid: number, timeout?: number) => Promise<boolean> };
};

// Best-effort sync-back: the server transaction is already committed, so a
// timeout here (e.g. the shape stream is still catching up) must not fail the
// outbox entry — the row lands whenever the stream delivers it.
async function awaitTxIds(
  collection: AwaitableCollection,
  txids: Array<number>,
): Promise<void> {
  await Promise.all(
    txids.map((txid) => collection.utils.awaitTxId(txid).catch(() => {})),
  );
}

// A replayed delete may land after the row is already gone (e.g. the server
// committed it but the tab closed before the outbox entry cleared). Treat a
// NOT_FOUND from such a retry as success so it drains instead of error-looping.
function isNotFound(error: unknown): boolean {
  return (
    error instanceof TRPCClientError && error.data?.code === "NOT_FOUND"
  );
}

const mutationFns = {
  createDeck: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    const txids: number[] = [];
    for (const m of rows) {
      const d = m.modified;
      const { txid } = await trpc.decks.create.mutate({
        id: d.id,
        name: d.name,
        description: d.description,
        learning_profile_id: d.learning_profile_id,
      });
      txids.push(txid);
    }
    await awaitTxIds(decksCollection, txids);
  },

  updateDeck: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    const txids: number[] = [];
    for (const m of rows) {
      const d = m.modified;
      const { txid } = await trpc.decks.update.mutate({
        id: d.id,
        name: d.name,
        description: d.description,
        learning_profile_id: d.learning_profile_id,
      });
      txids.push(txid);
    }
    await awaitTxIds(decksCollection, txids);
  },

  deleteDeck: async ({ transaction }) => {
    const txids: number[] = [];
    for (const m of mutationsFor(transaction, "decks")) {
      try {
        const { txid } = await trpc.decks.delete.mutate({
          id: m.key as string,
        });
        txids.push(txid);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    await awaitTxIds(decksCollection, txids);
  },

  // Shared by single-card creates and bulk imports. Grouped by deck so a
  // multi-card insert hits the server once per deck (matches the old handler).
  insertCards: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const byDeck = new Map<
      string,
      { id: string; front: string; back: string }[]
    >();
    for (const m of rows) {
      const c = m.modified;
      const list = byDeck.get(c.deck_id) ?? [];
      list.push({ id: c.id, front: c.front, back: c.back });
      byDeck.set(c.deck_id, list);
    }
    const results = await Promise.all(
      [...byDeck.entries()].map(([deckId, cards]) =>
        trpc.cards.create.mutate({ deckId, cards }),
      ),
    );
    await awaitTxIds(
      cardsCollection,
      results.map((r) => r.txid),
    );
  },

  updateCard: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const txids: number[] = [];
    for (const m of rows) {
      const c = m.modified;
      const { txid } = await trpc.cards.update.mutate({
        id: c.id,
        front: c.front,
        back: c.back,
      });
      txids.push(txid);
    }
    await awaitTxIds(cardsCollection, txids);
  },

  deleteCard: async ({ transaction }) => {
    const txids: number[] = [];
    for (const m of mutationsFor(transaction, "cards")) {
      try {
        const { txid } = await trpc.cards.delete.mutate({
          id: m.key as string,
        });
        txids.push(txid);
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    await awaitTxIds(cardsCollection, txids);
  },

  // Deck + its cards committed atomically server-side. The transaction carries
  // one decks insert and N cards inserts.
  importDeck: async ({ transaction }) => {
    const [deck] = mutationsFor(transaction, "decks") as Mutated<DeckRow>[];
    if (!deck) return;
    const d = deck.modified;
    const cardMuts = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const { txid } = await trpc.decks.import.mutate({
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
    await Promise.all([
      awaitTxIds(decksCollection, [txid]),
      cardMuts.length > 0
        ? awaitTxIds(cardsCollection, [txid])
        : Promise.resolve(),
    ]);
  },

  // FSRS is computed client-side; this just persists the card patch + review
  // log it produced. Both ride the optimistic mutations (Dates intact across a
  // reload), so the full server payload is reconstructed from them here.
  rateCard: async ({ transaction }) => {
    const [cardMut] = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    const [logMut] = mutationsFor(
      transaction,
      "review_logs",
    ) as Mutated<ReviewLogRow>[];
    if (!cardMut || !logMut) return;
    const c = cardMut.modified;
    const l = logMut.modified;
    const { txid } = await trpc.cards.rate.mutate({
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
    await Promise.all([
      awaitTxIds(cardsCollection, [txid]),
      awaitTxIds(reviewLogsCollection, [txid]),
    ]);
  },
} satisfies Record<string, MutationFn>;

export type MutationFnName = keyof typeof mutationFns;

/**
 * tRPC codes that describe a settled answer — replaying the same payload can
 * only repeat the same response, so retrying is pointless. UNAUTHORIZED is
 * deliberately absent: an expired session can be restored by signing back in,
 * and failing permanently there would drop the queued writes.
 */
const NON_RETRIABLE_TRPC_CODES = new Set([
  "BAD_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "UNPROCESSABLE_CONTENT",
  "METHOD_NOT_SUPPORTED",
  "PARSE_ERROR",
]);

// The executor's default retry policy only recognises HTTP status substrings
// ("400", "403", …) in error messages, which tRPC client errors never contain
// (they carry the zod/server message). Without this mapping a rejected payload
// retries forever with no visible error.
function failFastOnSettledError(fn: MutationFn): MutationFn {
  return async (params) => {
    try {
      return await fn(params);
    } catch (error) {
      if (
        error instanceof TRPCClientError &&
        NON_RETRIABLE_TRPC_CODES.has(error.data?.code as string)
      ) {
        throw new NonRetriableError(error.message);
      }
      throw error;
    }
  };
}

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
    mutationFns: Object.fromEntries(
      Object.entries(mutationFns).map(([name, fn]) => [
        name,
        failFastOnSettledError(fn),
      ]),
    ) as typeof mutationFns,
  });
  return executor;
}

/**
 * Start the executor; it replays any outbox entries left over from a previous
 * session on its own. Call once on app mount (alongside `preloadCollections`).
 * Replayed rows reconcile through the Electric stream like any other write —
 * no refetching needed.
 */
export function startOutbox(): void {
  void getExecutor();
}

/**
 * Drop every queued (not yet replayed) write. Only used on sign-out: queued
 * mutations belong to the signed-out user and must not replay into whichever
 * account signs in next on this device.
 */
export async function clearOutbox(): Promise<void> {
  const ex = getExecutor();
  if (ex) await ex.clearOutbox();
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
