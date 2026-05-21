import {
  IndexedDBAdapter,
  startOfflineExecutor,
  type OfflineExecutor,
} from "@tanstack/offline-transactions";
import { getCollections } from "@/lib/collections";
import type {
  TCardContentRow,
  TDeckRow,
  TLearningProfileRow,
} from "@/lib/db-types";
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
 * Durable offline write queue.
 *
 * Persisted collections already make reads + optimistic writes survive a
 * restart; the offline executor adds a durable outbox in IndexedDB so writes
 * made while offline are replayed automatically once connectivity returns
 * (with leader election across tabs and exponential backoff).
 *
 * Each replay function mirrors the corresponding collection write handler.
 */

/** Minimal view of the transaction an offline replay function receives. */
type ReplayParams = {
  transaction: {
    mutations: Array<{
      type: "insert" | "update" | "delete";
      modified: unknown;
      original: unknown;
    }>;
  };
};

const decksReplay = async ({ transaction }: ReplayParams) => {
  for (const m of transaction.mutations) {
    if (m.type === "delete") {
      await deleteDeckFn({ data: { id: (m.original as TDeckRow).id } });
      continue;
    }
    const r = m.modified as TDeckRow;
    const data = {
      id: r.id,
      name: r.name,
      description: r.description,
      learning_profile_id: r.learning_profile_id,
      updated_at: r.updated_at,
    };
    if (m.type === "insert") {
      await createDeckFn({ data: { ...data, created_at: r.created_at } });
    } else {
      await updateDeckFn({ data });
    }
  }
};

const cardContentsReplay = async ({ transaction }: ReplayParams) => {
  for (const m of transaction.mutations) {
    if (m.type !== "update") continue;
    const r = m.modified as TCardContentRow;
    await updateCardContentFn({
      data: {
        card_id: r.card_id,
        front: r.front,
        back: r.back,
        updated_at: r.updated_at,
      },
    });
  }
};

const cardsReplay = async ({ transaction }: ReplayParams) => {
  for (const m of transaction.mutations) {
    if (m.type === "delete") {
      await deleteCardFn({ data: { id: (m.original as { id: string }).id } });
    }
  }
};

const learningProfilesReplay = async ({ transaction }: ReplayParams) => {
  for (const m of transaction.mutations) {
    if (m.type === "delete") {
      await deleteLearningProfileFn({
        data: { id: (m.original as TLearningProfileRow).id },
      });
      continue;
    }
    const r = m.modified as TLearningProfileRow;
    if (m.type === "insert") {
      await createLearningProfileFn({
        data: {
          id: r.id,
          name: r.name,
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
      });
    } else {
      await updateLearningProfileFn({
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
    }
  }
};

let executor: OfflineExecutor | null = null;

/** Start the durable offline executor. Safe to call once, browser-only. */
export function startOfflineSync(): OfflineExecutor | null {
  if (executor) return executor;
  try {
    const c = getCollections();
    executor = startOfflineExecutor({
      storage: new IndexedDBAdapter("lexeme-outbox"),
      collections: {
        decks: c.decks,
        cards: c.cards,
        card_contents: c.cardContents,
        learning_profiles: c.learningProfiles,
        review_logs: c.reviewLogs,
      },
      mutationFns: {
        decks: decksReplay,
        cards: cardsReplay,
        card_contents: cardContentsReplay,
        learning_profiles: learningProfilesReplay,
      },
      onUnknownMutationFn: (name) =>
        console.warn(`[offline] no replay fn registered for "${name}"`),
      onStorageFailure: (diagnostic) =>
        console.warn("[offline] storage failure", diagnostic),
    });
  } catch (err) {
    // The persisted collections still provide offline reads + optimistic
    // writes even if the durable outbox fails to start.
    console.error("[offline] failed to start executor", err);
    executor = null;
  }
  return executor;
}

export function getOfflineExecutor(): OfflineExecutor | null {
  return executor;
}
