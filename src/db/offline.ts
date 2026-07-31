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
  refetchCollections,
  reviewLogsCollection,
  type CardRow,
  type DeckRow,
  type LearningProfileRow,
  type RefetchableCollection,
  type ReviewLogRow,
} from "@/db/collections";
import { pingOtherTabs } from "@/db/refresh";
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
 * Confirmation is a refetch: after the tRPC mutation commits, the affected
 * collections pull the server state before the optimistic overlay drops, so
 * rows never flicker out. Cascades matter here — deleting a deck or card
 * removes dependent rows server-side, so those collections refetch too.
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

// Best-effort sync-back: the server transaction is already committed, so a
// failed refetch must not fail the outbox entry — the rows land on the next
// freshness trigger. The ping tells other tabs of this device to pull too.
async function syncBack(
  collections: Array<RefetchableCollection>,
): Promise<void> {
  await refetchCollections(collections);
  pingOtherTabs();
}

// A replayed delete may land after the row is already gone (e.g. the server
// committed it but the tab closed before the outbox entry cleared). Treat a
// NOT_FOUND from such a retry as success so it drains instead of error-looping.
function isNotFound(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === "NOT_FOUND";
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
    await syncBack([decksCollection]);
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
    await syncBack([decksCollection]);
  },

  // Deck deletion cascades into cards and review logs server-side.
  deleteDeck: async ({ transaction }) => {
    for (const m of mutationsFor(transaction, "decks")) {
      try {
        await trpc.decks.delete.mutate({ id: m.key as string });
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    await syncBack([decksCollection, cardsCollection, reviewLogsCollection]);
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
    await Promise.all(
      [...byDeck.entries()].map(([deckId, cards]) =>
        trpc.cards.create.mutate({ deckId, cards }),
      ),
    );
    await syncBack([cardsCollection]);
  },

  updateCard: async ({ transaction }) => {
    const rows = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    for (const m of rows) {
      const c = m.modified;
      await trpc.cards.update.mutate({
        id: c.id,
        front: c.front,
        back: c.back,
      });
    }
    await syncBack([cardsCollection]);
  },

  // Card deletion cascades into review logs server-side.
  deleteCard: async ({ transaction }) => {
    for (const m of mutationsFor(transaction, "cards")) {
      try {
        await trpc.cards.delete.mutate({ id: m.key as string });
      } catch (error) {
        if (!isNotFound(error)) throw error;
      }
    }
    await syncBack([cardsCollection, reviewLogsCollection]);
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
    await syncBack(
      cardMuts.length > 0
        ? [decksCollection, cardsCollection]
        : [decksCollection],
    );
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
    await syncBack([cardsCollection, reviewLogsCollection]);
  },

  // An FSRS optimization pass (or a reset to defaults): the profile's new
  // weights and every card memory state re-derived under them, committed in one
  // server transaction so the two can never disagree.
  calibrateProfile: async ({ transaction }) => {
    const [profileMut] = mutationsFor(
      transaction,
      "learning_profiles",
    ) as Mutated<LearningProfileRow>[];
    if (!profileMut) return;
    const p = profileMut.modified;
    const cardMuts = mutationsFor(transaction, "cards") as Mutated<CardRow>[];
    await trpc.learningProfiles.calibrate.mutate({
      id: p.id,
      w: p.w,
      // Always set by the action; the column is only nullable for "never ran".
      last_calibrated_at: p.last_calibrated_at ?? new Date(),
      memory_states: cardMuts.map((m) => ({
        id: m.modified.id,
        stability: m.modified.stability,
        difficulty: m.modified.difficulty,
      })),
    });
    await syncBack(
      cardMuts.length > 0
        ? [learningProfilesCollection, cardsCollection]
        : [learningProfilesCollection],
    );
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
 * Replayed writes sync back through the same refetch path as live ones.
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
