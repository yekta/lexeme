import { syncReadingArgs, updateProfileArgs } from "@lexeme/contracts";
import { cards, decks, learningProfiles, lookups, reviewLogs, user } from "@lexeme/db";
import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  GENERATE_CARD_EXCLUDE_FRONTS_LIMIT,
  Rating,
  computeStudyBuckets,
  createUserScheduler,
  dbRowToFSRSCard,
  fsrsCardToDbRow,
  reviewLogToDbRow,
  type DeckExport,
  type Grade,
  type TAccessRole,
} from "@lexeme/shared";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { generateBack } from "../ai/generate-back.ts";
import { generateBackForDeck, generateCardForDeck } from "../ai/generate-card.ts";
import type { TCaller } from "../caller.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { serverMutators } from "../zero.ts";
import {
  defaultProfileId,
  mustFindCard,
  mustFindDeck,
  mustFindProfile,
  presentCard,
  presentDeck,
  presentProfile,
  runMutator,
} from "./data.ts";

export type THttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type TOperation<TInput extends z.ZodObject = z.ZodObject> = {
  /** The MCP tool name. */
  name: string;
  title: string;
  description: string;
  role: TAccessRole;
  method: THttpMethod;
  /** Under `/api/v1`. `:params` are filled from the input of the same name. */
  path: string;
  input: TInput;
  run: (caller: TCaller, input: z.infer<TInput>) => Promise<unknown>;
};

function defineOperation<TInput extends z.ZodObject>(op: TOperation<TInput>) {
  return op as unknown as TOperation;
}

const MAX_CARDS_PER_WRITE = 1000;
const MAX_IMPORT_CARDS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const deckId = z.uuid().describe("The deck's id.");
const cardId = z.uuid().describe("The card's id.");
const profileId = z.uuid().describe("The learning profile's id.");
const cardContent = z.object({
  front: z.string().trim().min(1).describe("The prompt side of the card."),
  back: z.string().trim().min(1).describe("The answer side of the card."),
});

const RATINGS: Record<"again" | "hard" | "good" | "easy", Grade> = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy };

/** Today's limits only care about today's reviews; two days covers any timezone. */
async function recentLogs(userId: string, now: number) {
  const rows = await db
    .select({
      card_id: reviewLogs.card_id,
      rating: reviewLogs.rating,
      state: reviewLogs.state,
      review: reviewLogs.review,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.user_id, userId), gte(reviewLogs.review, new Date(now - 2 * DAY_MS))));
  return rows.map((log) => ({ ...log, review: log.review.getTime() }));
}

/** Where words from an e-reader go when the device hasn't picked a deck. */
const DEVICE_DECK_NAME = "Kindle";

async function deviceDeck(userId: string) {
  const [existing] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.user_id, userId), eq(decks.name, DEVICE_DECK_NAME)))
    .orderBy(asc(decks.created_at))
    .limit(1);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await runMutator(userId, serverMutators.deck.create, {
    id,
    name: DEVICE_DECK_NAME,
    description: "Words added while reading.",
    learning_profile_id: await defaultProfileId(userId),
  });
  return mustFindDeck(userId, id);
}

async function studyBuckets(userId: string, deck: typeof decks.$inferSelect) {
  const now = Date.now();
  const [deckCards, logs, profile] = await Promise.all([
    db.select().from(cards).where(eq(cards.deck_id, deck.id)),
    recentLogs(userId, now),
    mustFindProfile(userId, deck.learning_profile_id),
  ]);
  const buckets = computeStudyBuckets({
    deckCards: deckCards.map((card) => ({ ...card, due: card.due.getTime(), row: card })),
    logs,
    profile,
    now,
  });
  return { buckets, total: deckCards.length };
}

export const operations: TOperation[] = [
  defineOperation({
    name: "whoami",
    title: "Who am I",
    description: "The signed-in account and the role this credential has.",
    role: "viewer",
    method: "GET",
    path: "/me",
    input: z.object({}),
    run: async (caller) => {
      const [account] = await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, caller.userId))
        .limit(1);
      return { user: account, role: caller.role, via: caller.via };
    },
  }),

  defineOperation({
    name: "list-decks",
    title: "List decks",
    description:
      "Every deck with its card count and what is studyable now: new, learning and due review cards.",
    role: "viewer",
    method: "GET",
    path: "/decks",
    input: z.object({}),
    run: async (caller) => {
      const now = Date.now();
      const [deckRows, cardRows, logs, profiles] = await Promise.all([
        db
          .select()
          .from(decks)
          .where(eq(decks.user_id, caller.userId))
          .orderBy(desc(decks.created_at)),
        db
          .select({ id: cards.id, deck_id: cards.deck_id, state: cards.state, due: cards.due })
          .from(cards)
          .where(eq(cards.user_id, caller.userId)),
        recentLogs(caller.userId, now),
        db.select().from(learningProfiles).where(eq(learningProfiles.user_id, caller.userId)),
      ]);
      const profileById = new Map(profiles.map((p) => [p.id, p]));

      return {
        decks: deckRows.map((deck) => {
          const deckCards = cardRows
            .filter((card) => card.deck_id === deck.id)
            .map((card) => ({ ...card, due: card.due.getTime() }));
          const buckets = computeStudyBuckets({
            deckCards,
            logs,
            profile: profileById.get(deck.learning_profile_id),
            now,
          });
          return {
            ...presentDeck(deck),
            card_count: deckCards.length,
            new_count: buckets.newCards.length,
            learning_count: buckets.learningCards.length,
            due_count: buckets.reviewCards.length,
          };
        }),
      };
    },
  }),

  defineOperation({
    name: "get-deck",
    title: "Get deck",
    description: "One deck with its card count and what is studyable now.",
    role: "viewer",
    method: "GET",
    path: "/decks/:deck_id",
    input: z.object({ deck_id: deckId }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      const { buckets, total } = await studyBuckets(caller.userId, deck);
      return {
        deck: {
          ...presentDeck(deck),
          card_count: total,
          new_count: buckets.newCards.length,
          learning_count: buckets.learningCards.length,
          due_count: buckets.reviewCards.length,
        },
      };
    },
  }),

  defineOperation({
    name: "create-deck",
    title: "Create deck",
    description: "Create an empty deck. Uses the default learning profile unless one is given.",
    role: "editor",
    method: "POST",
    path: "/decks",
    input: z.object({
      name: z.string().trim().min(1),
      description: z.string().trim().default(""),
      learning_profile_id: profileId.optional(),
    }),
    run: async (caller, input) => {
      const id = crypto.randomUUID();
      await runMutator(caller.userId, serverMutators.deck.create, {
        id,
        name: input.name,
        description: input.description,
        learning_profile_id: input.learning_profile_id ?? (await defaultProfileId(caller.userId)),
      });
      return { deck: presentDeck(await mustFindDeck(caller.userId, id)) };
    },
  }),

  defineOperation({
    name: "update-deck",
    title: "Update deck",
    description: "Rename a deck, change its description or move it to another learning profile.",
    role: "editor",
    method: "PATCH",
    path: "/decks/:deck_id",
    input: z.object({
      deck_id: deckId,
      name: z.string().trim().min(1).optional(),
      description: z.string().trim().optional(),
      learning_profile_id: profileId.optional(),
    }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      await runMutator(caller.userId, serverMutators.deck.update, {
        id: deck.id,
        name: input.name ?? deck.name,
        description: input.description ?? deck.description,
        learning_profile_id: input.learning_profile_id ?? deck.learning_profile_id,
      });
      return { deck: presentDeck(await mustFindDeck(caller.userId, deck.id)) };
    },
  }),

  defineOperation({
    name: "delete-deck",
    title: "Delete deck",
    description: "Delete a deck with all its cards and their review history. This can't be undone.",
    role: "admin",
    method: "DELETE",
    path: "/decks/:deck_id",
    input: z.object({ deck_id: deckId }),
    run: async (caller, input) => {
      await mustFindDeck(caller.userId, input.deck_id);
      await runMutator(caller.userId, serverMutators.deck.delete, { id: input.deck_id });
      return { deleted: true };
    },
  }),

  defineOperation({
    name: "import-deck",
    title: "Import deck",
    description:
      "Create a deck and its cards in one step, all or nothing. Accepts the same shape export-deck returns.",
    role: "editor",
    method: "POST",
    path: "/decks/import",
    input: z.object({
      deck: z.object({
        name: z.string().trim().min(1),
        description: z.string().trim().default(""),
      }),
      cards: z.array(cardContent).max(MAX_IMPORT_CARDS),
      learning_profile_id: profileId.optional(),
    }),
    run: async (caller, input) => {
      const id = crypto.randomUUID();
      await runMutator(caller.userId, serverMutators.deck.import, {
        id,
        name: input.deck.name,
        description: input.deck.description,
        learning_profile_id: input.learning_profile_id ?? (await defaultProfileId(caller.userId)),
        cards: input.cards.map((card) => ({ id: crypto.randomUUID(), ...card })),
      });
      return {
        deck: { ...presentDeck(await mustFindDeck(caller.userId, id)), card_count: input.cards.length },
      };
    },
  }),

  defineOperation({
    name: "export-deck",
    title: "Export deck",
    description: "A deck's name, description and card contents, without ids or study history.",
    role: "viewer",
    method: "GET",
    path: "/decks/:deck_id/export",
    input: z.object({ deck_id: deckId }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      const rows = await db
        .select({ front: cards.front, back: cards.back })
        .from(cards)
        .where(eq(cards.deck_id, deck.id))
        .orderBy(asc(cards.created_at));
      return {
        version: DECK_EXPORT_VERSION,
        kind: DECK_EXPORT_KIND,
        deck: { name: deck.name, description: deck.description },
        cards: rows,
      } satisfies DeckExport;
    },
  }),

  defineOperation({
    name: "list-cards",
    title: "List cards",
    description:
      "A deck's cards, newest first. Use search to find cards whose front or back contains some text, for example to avoid adding a duplicate.",
    role: "viewer",
    method: "GET",
    path: "/decks/:deck_id/cards",
    input: z.object({
      deck_id: deckId,
      search: z.string().trim().min(1).optional().describe("Case-insensitive text to look for."),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      const pattern = input.search && `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await db
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.deck_id, deck.id),
            pattern ? or(ilike(cards.front, pattern), ilike(cards.back, pattern)) : undefined,
          ),
        )
        .orderBy(desc(cards.created_at), desc(cards.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      return {
        cards: rows.slice(0, input.limit).map(presentCard),
        has_more: rows.length > input.limit,
      };
    },
  }),

  defineOperation({
    name: "get-card",
    title: "Get card",
    description: "One card with its scheduling state.",
    role: "viewer",
    method: "GET",
    path: "/cards/:card_id",
    input: z.object({ card_id: cardId }),
    run: async (caller, input) => ({
      card: presentCard(await mustFindCard(caller.userId, input.card_id)),
    }),
  }),

  defineOperation({
    name: "add-cards",
    title: "Add cards",
    description: `Add up to ${MAX_CARDS_PER_WRITE} cards to a deck in one step. New cards are ready to study right away.`,
    role: "editor",
    method: "POST",
    path: "/decks/:deck_id/cards",
    input: z.object({
      deck_id: deckId,
      cards: z.array(cardContent).min(1).max(MAX_CARDS_PER_WRITE),
    }),
    run: async (caller, input) => {
      await mustFindDeck(caller.userId, input.deck_id);
      const withIds = input.cards.map((card) => ({ id: crypto.randomUUID(), ...card }));
      await runMutator(caller.userId, serverMutators.card.insert, {
        deck_id: input.deck_id,
        cards: withIds,
      });
      const rows = await db
        .select()
        .from(cards)
        .where(inArray(cards.id, withIds.map((card) => card.id)))
        .orderBy(asc(cards.created_at));
      return { cards: rows.map(presentCard) };
    },
  }),

  defineOperation({
    name: "update-card",
    title: "Update card",
    description: "Change a card's front or back. Its study history is kept.",
    role: "editor",
    method: "PATCH",
    path: "/cards/:card_id",
    input: z.object({
      card_id: cardId,
      front: cardContent.shape.front.optional(),
      back: cardContent.shape.back.optional(),
    }),
    run: async (caller, input) => {
      const card = await mustFindCard(caller.userId, input.card_id);
      await runMutator(caller.userId, serverMutators.card.update, {
        id: card.id,
        front: input.front ?? card.front,
        back: input.back ?? card.back,
      });
      return { card: presentCard(await mustFindCard(caller.userId, card.id)) };
    },
  }),

  defineOperation({
    name: "generate-card",
    title: "Generate card",
    description:
      "Suggest one new card that fits a deck and follows the style of its existing cards. Nothing is saved: add it with add-cards if the user keeps it. The deck needs at least one card.",
    role: "editor",
    method: "POST",
    path: "/decks/:deck_id/generate-card",
    input: z.object({
      deck_id: deckId,
      exclude_fronts: z
        .array(z.string().trim().min(1))
        .max(GENERATE_CARD_EXCLUDE_FRONTS_LIMIT)
        .default([])
        .describe("Fronts already suggested and turned down, so they are not suggested again."),
    }),
    run: async (caller, input) => {
      await mustFindDeck(caller.userId, input.deck_id);
      return {
        card: await generateCardForDeck({ deckId: input.deck_id, excludeFronts: input.exclude_fronts }),
      };
    },
  }),

  defineOperation({
    name: "generate-back",
    title: "Generate back",
    description:
      "Write the back for a front, following the style of the deck's existing cards. Nothing is saved. The deck needs at least one other card.",
    role: "editor",
    method: "POST",
    path: "/decks/:deck_id/generate-back",
    input: z.object({ deck_id: deckId, front: cardContent.shape.front }),
    run: async (caller, input) => {
      await mustFindDeck(caller.userId, input.deck_id);
      return { back: await generateBackForDeck({ deckId: input.deck_id, front: input.front }) };
    },
  }),

  defineOperation({
    name: "add-word",
    title: "Add word",
    description:
      "Add a word met while reading as a card. The back is written for the sense the word has in `context`, in the deck's style. A word already in the deck isn't added again. Without a deck, the word goes to a deck named \"Kindle\", created if needed.",
    role: "editor",
    method: "POST",
    path: "/words",
    input: z.object({
      id: z.uuid().describe("Minted by the caller, so a retried request adds the word once."),
      deck_id: deckId.optional(),
      word: z.string().trim().min(1).max(200),
      context: z.string().trim().max(5000).optional().describe("The sentence the word was read in."),
      book_key: z.string().trim().min(1).max(500).optional().describe("A book sent with sync-reading."),
      looked_up_at: z.number().int().min(0).optional().describe("Epoch milliseconds."),
    }),
    run: async (caller, input) => {
      const [done] = await db
        .select({ card_id: lookups.card_id })
        .from(lookups)
        .where(and(eq(lookups.id, input.id), eq(lookups.user_id, caller.userId)))
        .limit(1);
      if (done?.card_id) {
        return { card: presentCard(await mustFindCard(caller.userId, done.card_id)), created: false };
      }

      const deck = input.deck_id ? await mustFindDeck(caller.userId, input.deck_id) : await deviceDeck(caller.userId);
      let [card] = await db
        .select()
        .from(cards)
        .where(and(eq(cards.deck_id, deck.id), sql`lower(${cards.front}) = lower(${input.word})`))
        .limit(1);
      const created = !card;
      if (!card) {
        const examples = await db
          .select({ front: cards.front, back: cards.back })
          .from(cards)
          .where(eq(cards.deck_id, deck.id))
          .orderBy(desc(cards.created_at))
          .limit(20);
        const back = await generateBack({ front: input.word, recentCards: examples, context: input.context });
        const id = crypto.randomUUID();
        await runMutator(caller.userId, serverMutators.card.insert, {
          deck_id: deck.id,
          cards: [{ id, front: input.word, back }],
        });
        card = await mustFindCard(caller.userId, id);
      }

      await runMutator(caller.userId, serverMutators.reading.sync, {
        books: [],
        page_reads: [],
        highlights: [],
        lookups: [
          {
            id: input.id,
            book_key: input.book_key,
            word: input.word,
            context: input.context,
            card_id: card.id,
            looked_up_at: input.looked_up_at ?? Date.now(),
          },
        ],
      });
      return { card: presentCard(card), deck: presentDeck(deck), created };
    },
  }),

  defineOperation({
    name: "sync-reading",
    title: "Sync reading data",
    description:
      "Send books, every page visit, highlights and bookmarks, and looked-up words from an e-reader. Rows are matched on the ids and book keys the device sends, so sending the same data again changes nothing.",
    role: "editor",
    method: "POST",
    path: "/reading",
    input: syncReadingArgs,
    run: async (caller, input) => {
      await runMutator(caller.userId, serverMutators.reading.sync, input);
      return {
        books: input.books.length,
        page_reads: input.page_reads.length,
        highlights: input.highlights.length,
        lookups: input.lookups.length,
      };
    },
  }),

  defineOperation({
    name: "delete-card",
    title: "Delete card",
    description: "Delete a card and its review history. This can't be undone.",
    role: "admin",
    method: "DELETE",
    path: "/cards/:card_id",
    input: z.object({ card_id: cardId }),
    run: async (caller, input) => {
      await mustFindCard(caller.userId, input.card_id);
      await runMutator(caller.userId, serverMutators.card.delete, { id: input.card_id });
      return { deleted: true };
    },
  }),

  defineOperation({
    name: "get-study-queue",
    title: "Get study queue",
    description:
      "The cards to study in a deck right now, in the order the app shows them, within the deck's daily limits. Show the front, let the user answer, then show the back and record the answer with review-card. Day boundaries are UTC.",
    role: "viewer",
    method: "GET",
    path: "/decks/:deck_id/study",
    input: z.object({
      deck_id: deckId,
      limit: z.coerce.number().int().min(1).max(200).default(20),
    }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      const { buckets } = await studyBuckets(caller.userId, deck);
      const queue = [...buckets.newCards, ...buckets.learningCards, ...buckets.reviewCards];
      return {
        new_count: buckets.newCards.length,
        learning_count: buckets.learningCards.length,
        due_count: buckets.reviewCards.length,
        cards: queue.slice(0, input.limit).map((card) => presentCard(card.row)),
      };
    },
  }),

  defineOperation({
    name: "review-card",
    title: "Review card",
    description:
      "Record an answer to a card, exactly like pressing a rating button in the app: again (forgot), hard, good or easy. Schedules the card's next review.",
    role: "editor",
    method: "POST",
    path: "/cards/:card_id/review",
    input: z.object({
      card_id: cardId,
      rating: z.enum(["again", "hard", "good", "easy"]),
      duration_ms: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("How long the user took to answer, if known."),
    }),
    run: async (caller, input) => {
      const card = await mustFindCard(caller.userId, input.card_id);
      const deck = await mustFindDeck(caller.userId, card.deck_id);
      const profile = await mustFindProfile(caller.userId, deck.learning_profile_id);

      const now = new Date();
      const result = createUserScheduler(profile).next(
        dbRowToFSRSCard(card),
        now,
        RATINGS[input.rating],
      );
      const cardPatch = fsrsCardToDbRow(result.card);
      const log = reviewLogToDbRow(result.log, card.id, input.duration_ms);
      await runMutator(caller.userId, serverMutators.card.rate, {
        card_id: card.id,
        review_log_id: crypto.randomUUID(),
        duration_ms: input.duration_ms,
        card: cardPatch,
        log: {
          rating: log.rating,
          state: log.state,
          due: log.due,
          stability: log.stability,
          difficulty: log.difficulty,
          scheduled_days: log.scheduled_days,
          learning_steps: log.learning_steps,
          review: log.review,
        },
      });
      return { card: presentCard(await mustFindCard(caller.userId, card.id)) };
    },
  }),

  defineOperation({
    name: "list-learning-profiles",
    title: "List learning profiles",
    description:
      "Learning profiles hold a deck's daily limits and scheduling settings. Every account has a default one.",
    role: "viewer",
    method: "GET",
    path: "/learning-profiles",
    input: z.object({}),
    run: async (caller) => {
      const rows = await db
        .select()
        .from(learningProfiles)
        .where(eq(learningProfiles.user_id, caller.userId))
        .orderBy(desc(learningProfiles.is_default), asc(learningProfiles.created_at));
      return { learning_profiles: rows.map(presentProfile) };
    },
  }),

  defineOperation({
    name: "create-learning-profile",
    title: "Create learning profile",
    description: "Create a learning profile with the default settings.",
    role: "editor",
    method: "POST",
    path: "/learning-profiles",
    input: z.object({ name: z.string().trim().min(1) }),
    run: async (caller, input) => {
      const id = crypto.randomUUID();
      await runMutator(caller.userId, serverMutators.learningProfile.create, {
        id,
        name: input.name,
      });
      return { learning_profile: presentProfile(await mustFindProfile(caller.userId, id)) };
    },
  }),

  defineOperation({
    name: "update-learning-profile",
    title: "Update learning profile",
    description:
      "Change a learning profile's name, daily limits or scheduling settings. Steps are durations like 1m, 10m or 1d.",
    role: "editor",
    method: "PATCH",
    path: "/learning-profiles/:profile_id",
    input: updateProfileArgs.omit({ id: true, w: true }).extend({ profile_id: profileId }),
    run: async (caller, input) => {
      const { profile_id, ...fields } = input;
      await mustFindProfile(caller.userId, profile_id);
      await runMutator(caller.userId, serverMutators.learningProfile.update, {
        id: profile_id,
        ...fields,
      });
      return { learning_profile: presentProfile(await mustFindProfile(caller.userId, profile_id)) };
    },
  }),

  defineOperation({
    name: "delete-learning-profile",
    title: "Delete learning profile",
    description: "Delete a learning profile. The default profile and profiles used by a deck can't be deleted.",
    role: "admin",
    method: "DELETE",
    path: "/learning-profiles/:profile_id",
    input: z.object({ profile_id: profileId }),
    run: async (caller, input) => {
      await mustFindProfile(caller.userId, input.profile_id);
      await runMutator(caller.userId, serverMutators.learningProfile.delete, {
        id: input.profile_id,
      });
      return { deleted: true };
    },
  }),
];

export function parseOperationInput(op: TOperation, raw: unknown) {
  const parsed = op.input.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  throw new ApiError("BAD_REQUEST", `${where}${issue?.message ?? "Invalid input."}`);
}
