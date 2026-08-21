import { defineMutator, defineMutators } from "@rocicorp/zero";
import type { Transaction } from "@rocicorp/zero";
import { z } from "zod";

import {
  CARD_STATES,
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
  FSRS_DEFAULT_ENABLE_FUZZ,
  FSRS_DEFAULT_ENABLE_SHORT_TERM,
  FSRS_DEFAULT_LEARNING_STEPS,
  FSRS_DEFAULT_MAXIMUM_INTERVAL,
  FSRS_DEFAULT_RELEARNING_STEPS,
  FSRS_DEFAULT_REQUEST_RETENTION,
  FSRS_DEFAULT_W,
} from "@lexeme/shared";
import { mustBeSignedIn } from "./context.ts";
import { zql } from "./schema.ts";

/**
 * The shared custom mutators.
 *
 * Each one runs twice: optimistically on the client against its local store,
 * and authoritatively on the server at `/api/zero/mutate`, where `ctx` comes
 * from the verified session and the writes land in Postgres. Same function
 * both times, which is what collapses the old split between the `onMutate`
 * callbacks in `hooks/data/*` and the tRPC router bodies that mirrored them.
 *
 * Conflict policy is last-writer-wins per mutation: single-user data, no CRDTs.
 *
 * Zero tracks mutation ids per client group and applies each one exactly once
 * server-side, so none of these needs the `onConflictDoNothing` the old durable
 * outbox required to make a replay idempotent.
 *
 * Timestamps are epoch milliseconds, because that is how Zero represents
 * `timestamptz`. Values the scheduler computed (`due`, `last_review`, `review`)
 * are always passed in as arguments so the client and server runs agree
 * exactly; only bookkeeping stamps (`created_at`/`updated_at`) are taken from
 * `Date.now()` inside a mutator, where a few milliseconds of drift between the
 * two runs is invisible and the server's value wins on replication.
 */

const uuidArg = z.uuid();
const cardStateArg = z.enum(CARD_STATES);

/** FSRS-6 weight vector: fixed length, all finite. A malformed `w` would
 * corrupt scheduling for every card on the profile. */
const fsrsWeights = z.array(z.number().finite()).length(FSRS_DEFAULT_W.length);

const idArgs = z.object({ id: uuidArg });

const deckFieldArgs = {
  name: z.string().trim().min(1),
  description: z.string().trim(),
  learning_profile_id: uuidArg,
};

const cardContentArgs = z.object({
  id: uuidArg,
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
});

export const createDeckArgs = z.object({ id: uuidArg, ...deckFieldArgs });
export const updateDeckArgs = z.object({ id: uuidArg, ...deckFieldArgs });
export const importDeckArgs = z.object({
  id: uuidArg,
  ...deckFieldArgs,
  cards: z.array(cardContentArgs),
});

export const insertCardsArgs = z.object({
  deck_id: uuidArg,
  cards: z.array(cardContentArgs).min(1),
});
export const updateCardArgs = cardContentArgs;

export const rateCardArgs = z.object({
  card_id: uuidArg,
  review_log_id: uuidArg,
  duration_ms: z.number().int().min(0),
  // Exactly the fields `fsrsCardToDbRow` produces. `elapsed_days` is absent on
  // purpose: FSRS does not recompute it on an answer, so a rate must leave that
  // column alone rather than write a value it made up.
  card: z.object({
    due: z.number(),
    stability: z.number(),
    difficulty: z.number(),
    scheduled_days: z.number().int(),
    reps: z.number().int(),
    lapses: z.number().int(),
    state: cardStateArg,
    learning_steps: z.number().int(),
    last_review: z.number().nullable(),
  }),
  log: z.object({
    rating: z.number().int(),
    state: cardStateArg,
    due: z.number(),
    stability: z.number(),
    difficulty: z.number(),
    scheduled_days: z.number().int(),
    learning_steps: z.number().int(),
    review: z.number(),
  }),
});

export const createProfileArgs = z.object({
  id: uuidArg,
  name: z.string().trim().min(1),
});

export const updateProfileArgs = z.object({
  id: uuidArg,
  name: z.string().trim().min(1).optional(),
  new_cards_per_day: z.number().int().min(0).optional(),
  max_reviews_per_day: z.number().int().min(0).optional(),
  request_retention: z.number().min(0).max(1).optional(),
  maximum_interval: z.number().int().min(1).optional(),
  w: fsrsWeights.optional(),
  enable_fuzz: z.boolean().optional(),
  enable_short_term: z.boolean().optional(),
  learning_steps: z.array(z.string()).optional(),
  relearning_steps: z.array(z.string()).optional(),
});

export const calibrateProfileArgs = z.object({
  id: uuidArg,
  w: fsrsWeights,
  last_calibrated_at: z.number(),
  memory_states: z
    .array(
      z.object({
        id: uuidArg,
        stability: z.number().finite(),
        difficulty: z.number().finite(),
      }),
    )
    .max(10_000),
});

// --- access ---
//
// The old tRPC procedures asked Postgres these questions through
// `server/api/access.ts`. Here the same questions are asked through `tx.run`,
// which answers from the local store on the client and from Postgres on the
// server. Only the server's answer is authoritative: the client's local store
// holds only rows it already owns, but running the check in both places keeps
// an unauthorized write from ever being applied optimistically.
//
// NOT_FOUND and FORBIDDEN stay distinguishable, as they were in `access.ts`:
// the lookup is deliberately not scoped by user.

async function mustOwnDeck(tx: Transaction, userId: string, deckId: string) {
  const deck = await tx.run(zql.decks.where("id", deckId).one());
  if (!deck) throw new Error("That deck no longer exists.");
  if (deck.user_id !== userId) throw new Error("You don't have access to that deck.");
  return deck;
}

async function mustOwnCard(tx: Transaction, userId: string, cardId: string) {
  const card = await tx.run(zql.cards.where("id", cardId).one());
  if (!card) throw new Error("That card no longer exists.");
  if (card.user_id !== userId) throw new Error("You don't have access to that card.");
  return card;
}

export async function mustOwnProfile(
  tx: Transaction,
  userId: string,
  profileId: string,
) {
  const profile = await tx.run(zql.learning_profiles.where("id", profileId).one());
  if (!profile) throw new Error("That learning profile no longer exists.");
  if (profile.user_id !== userId) {
    throw new Error("You don't have access to that learning profile.");
  }
  return profile;
}

/**
 * Remove the rows a Postgres `ON DELETE CASCADE` would remove.
 *
 * Only on the client. The server run writes real SQL inside a transaction, so
 * the foreign keys do this themselves in one statement, and zero-cache picks
 * the cascaded deletes out of the WAL like any other change. The client's local
 * store has no foreign keys, so without this a deleted deck would leave its
 * cards (and their review logs) behind until the next sync corrected it:
 * visible as orphan rows in the deck badges and the study queue.
 */
async function cascadeDeleteCards(tx: Transaction, cardIds: string[]) {
  if (tx.location !== "client") return;
  for (const cardId of cardIds) {
    const logs = await tx.run(zql.review_logs.where("card_id", cardId));
    for (const log of logs) await tx.mutate.review_logs.delete({ id: log.id });
    await tx.mutate.cards.delete({ id: cardId });
  }
}

/**
 * The mutator definitions, before they are built into a registry.
 *
 * Exported separately so the server can compose them: it swaps one
 * implementation in (see `server/zero.ts`), and `defineMutators` turns
 * definitions into built mutators, so a registry cannot be spread back into
 * another one.
 */
export const mutatorDefs = {
  deck: {
    create: defineMutator(createDeckArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnProfile(tx, user_id, args.learning_profile_id);
      const now = Date.now();
      // The id is minted on the client so it can be navigated to immediately;
      // this only persists it.
      await tx.mutate.decks.insert({
        id: args.id,
        user_id,
        name: args.name,
        description: args.description,
        learning_profile_id: args.learning_profile_id,
        created_at: now,
        updated_at: now,
      });
    }),

    update: defineMutator(updateDeckArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnDeck(tx, user_id, args.id);
      await mustOwnProfile(tx, user_id, args.learning_profile_id);
      await tx.mutate.decks.update({
        id: args.id,
        name: args.name,
        description: args.description,
        learning_profile_id: args.learning_profile_id,
        updated_at: Date.now(),
      });
    }),

    delete: defineMutator(idArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnDeck(tx, user_id, args.id);
      const deckCards = await tx.run(zql.cards.where("deck_id", args.id));
      await cascadeDeleteCards(
        tx,
        deckCards.map((c) => c.id),
      );
      await tx.mutate.decks.delete({ id: args.id });
    }),

    /**
     * A deck and all its cards in one mutation, so either the whole import
     * lands or none of it does, no orphan empty deck if the cards fail.
     */
    import: defineMutator(importDeckArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnProfile(tx, user_id, args.learning_profile_id);
      const now = Date.now();
      await tx.mutate.decks.insert({
        id: args.id,
        user_id,
        name: args.name,
        description: args.description,
        learning_profile_id: args.learning_profile_id,
        created_at: now,
        updated_at: now,
      });
      for (const card of args.cards) {
        await tx.mutate.cards.insert(newCardRow({ ...card, deck_id: args.id, user_id, now }));
      }
    }),
  },

  card: {
    /** Shared by the single-card form and the bulk paste/import flow. */
    insert: defineMutator(insertCardsArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnDeck(tx, user_id, args.deck_id);
      const now = Date.now();
      for (const card of args.cards) {
        await tx.mutate.cards.insert(
          newCardRow({ ...card, deck_id: args.deck_id, user_id, now }),
        );
      }
    }),

    update: defineMutator(updateCardArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnCard(tx, user_id, args.id);
      await tx.mutate.cards.update({
        id: args.id,
        front: args.front,
        back: args.back,
        updated_at: Date.now(),
      });
    }),

    delete: defineMutator(idArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnCard(tx, user_id, args.id);
      await cascadeDeleteCards(tx, [args.id]);
      await tx.mutate.cards.delete({ id: args.id });
    }),

    /**
     * One answer. FSRS runs on the client, so this only persists what it
     * produced: the card's new memory/scheduling state and the review log that
     * records the answer. Both carry explicit timestamps rather than reading
     * the clock here, so the optimistic and authoritative runs cannot disagree
     * about when the review happened.
     */
    rate: defineMutator(rateCardArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnCard(tx, user_id, args.card_id);
      await tx.mutate.cards.update({
        id: args.card_id,
        ...args.card,
        last_review: args.card.last_review ?? undefined,
        updated_at: Date.now(),
      });
      await tx.mutate.review_logs.insert({
        id: args.review_log_id,
        card_id: args.card_id,
        user_id,
        rating: args.log.rating,
        state: args.log.state,
        due: args.log.due,
        stability: args.log.stability,
        difficulty: args.log.difficulty,
        scheduled_days: args.log.scheduled_days,
        learning_steps: args.log.learning_steps,
        review: args.log.review,
        duration_ms: args.duration_ms,
        created_at: Date.now(),
      });
    }),
  },

  learningProfile: {
    create: defineMutator(createProfileArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      const now = Date.now();
      await tx.mutate.learning_profiles.insert({
        id: args.id,
        user_id,
        name: args.name,
        is_default: false,
        ...FSRS_PROFILE_DEFAULTS,
        created_at: now,
        updated_at: now,
      });
    }),

    update: defineMutator(updateProfileArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnProfile(tx, user_id, args.id);
      await tx.mutate.learning_profiles.update({
        ...args,
        updated_at: Date.now(),
      });
    }),

    delete: defineMutator(idArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      const profile = await mustOwnProfile(tx, user_id, args.id);
      // `decks.learning_profile_id` is ON DELETE RESTRICT, so a profile still
      // in use cannot go; say so here rather than letting Postgres refuse it
      // with a constraint name.
      if (profile.is_default) throw new Error("The default profile can't be deleted.");
      const inUse = await tx.run(
        zql.decks.where("learning_profile_id", args.id).one(),
      );
      if (inUse) throw new Error("That profile is still used by a deck.");
      await tx.mutate.learning_profiles.delete({ id: args.id });
    }),

    /**
     * An FSRS optimization pass, or a reset to defaults: the profile's new
     * weights plus every card memory state re-derived under them, in one
     * mutation so the two can never disagree.
     *
     * Scheduling fields (`due`, `state`, `scheduled_days`) are deliberately
     * untouched: changing weights must never re-date existing cards, matching
     * Anki's default.
     */
    calibrate: defineMutator(calibrateProfileArgs, async ({ tx, ctx, args }) => {
      const { user_id } = mustBeSignedIn(ctx);
      await mustOwnProfile(tx, user_id, args.id);
      await tx.mutate.learning_profiles.update({
        id: args.id,
        w: args.w,
        last_calibrated_at: args.last_calibrated_at,
        updated_at: Date.now(),
      });
      if (args.memory_states.length === 0) return;

      // Row at a time. Correct everywhere and the right shape for the client's
      // optimistic run, but on the server this is one statement per card and
      // the batch reaches 10,000, so `server/zero.ts` overrides this mutator
      // with a single bulk UPDATE. Any change to what a calibration writes has
      // to be made in both places; the invariant is that they touch
      // `stability` and `difficulty` and nothing else.
      for (const state of args.memory_states) {
        await tx.mutate.cards.update({
          id: state.id,
          stability: state.stability,
          difficulty: state.difficulty,
        });
      }
    }),
  },
};

/** What the client constructs Zero with. */
export const mutators = defineMutators(mutatorDefs);

export type TMutators = typeof mutators;

// --- shared row shapes ---

/**
 * A brand-new card, with the FSRS defaults the database columns declare.
 *
 * Spelled out rather than left to the column defaults because a mutator writes
 * the same explicit row on the client and on the server, and a client row built
 * from different values than the server's would flicker when the real one
 * replicated back.
 */
function newCardRow(input: {
  id: string;
  deck_id: string;
  user_id: string;
  front: string;
  back: string;
  now: number;
}) {
  return {
    id: input.id,
    deck_id: input.deck_id,
    user_id: input.user_id,
    front: input.front,
    back: input.back,
    due: input.now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: "new" as const,
    learning_steps: 0,
    last_review: undefined,
    created_at: input.now,
    updated_at: input.now,
  };
}

/**
 * The FSRS settings a fresh profile starts with: the same values the
 * `learning_profiles` column defaults declare, for the same reason as
 * `newCardRow` above.
 */
const FSRS_PROFILE_DEFAULTS = {
  new_cards_per_day: DEFAULT_NEW_CARDS_PER_DAY,
  max_reviews_per_day: DEFAULT_MAX_REVIEWS_PER_DAY,
  request_retention: FSRS_DEFAULT_REQUEST_RETENTION,
  maximum_interval: FSRS_DEFAULT_MAXIMUM_INTERVAL,
  w: [...FSRS_DEFAULT_W],
  enable_fuzz: FSRS_DEFAULT_ENABLE_FUZZ,
  enable_short_term: FSRS_DEFAULT_ENABLE_SHORT_TERM,
  learning_steps: [...FSRS_DEFAULT_LEARNING_STEPS],
  relearning_steps: [...FSRS_DEFAULT_RELEARNING_STEPS],
  /** Null until a calibration pass has actually completed. */
  last_calibrated_at: undefined,
};
