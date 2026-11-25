import { SENDABLE_BOOK_EXTENSIONS, syncReadingArgs, updateProfileArgs } from "@lexeme/contracts";
import {
  books,
  cards,
  decks,
  highlights,
  learningProfiles,
  lookups,
  pageReads,
  readingGoals,
  reviewLogs,
  sentBooks,
  user,
} from "@lexeme/db";
import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  GENERATE_CARD_EXCLUDE_FRONTS_LIMIT,
  DEFAULT_DAILY_GOAL_MINUTES,
  DEFAULT_DAY_STARTS_AT,
  Rating,
  computeStudyBuckets,
  computeTrueRetention,
  createUserScheduler,
  dayKeyAtOffset,
  daysEndingOn,
  dbRowToFSRSCard,
  formatInterval,
  fsrsCardToDbRow,
  readingSessions,
  reviewLogToDbRow,
  secondsByDayAtOffset,
  streakEndingOn,
  type DeckExport,
  type FSRS,
  type Grade,
  type TAccessRole,
} from "@lexeme/shared";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { z } from "zod";

import { generateBack } from "../ai/generate-back.ts";
import { generateBackForDeck, generateCardForDeck } from "../ai/generate-card.ts";
import type { TCaller } from "../caller.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { startReadingImport } from "../reading-imports.ts";
import { fileNameOfPath, uploadCommand } from "../uploads.ts";
import { deleteSentBook, downloadBook, presentSentBook, saveSentBook, startBookUpload } from "../sent-books.ts";
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
const bookId = z.uuid().describe("The book's id, from list-books.");
const isoTime = z.iso.datetime({ offset: true });
const STILL_ON_DEVICE =
  "If it's still on the e-reader, the e-reader sends it again when it next syncs reading it, so delete it there too.";
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
  return { buckets, profile, total: deckCards.length };
}

/** What each rating would schedule, as the app labels its rating buttons. */
function ratingPreviews(scheduler: FSRS, card: typeof cards.$inferSelect, now: Date) {
  const preview = scheduler.repeat(dbRowToFSRSCard(card), now);
  return Object.fromEntries(
    Object.entries(RATINGS).map(([name, grade]) => {
      const due = preview[grade].card.due;
      return [name, { interval: formatInterval(due, now), interval_ms: due.getTime() - now.getTime() }];
    }),
  );
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
      "Every deck with its card count, its retention over the last 30 days, and what is studyable now: new, learning and due review cards.",
    role: "viewer",
    method: "GET",
    path: "/decks",
    input: z.object({}),
    run: async (caller) => {
      const now = Date.now();
      const [deckRows, cardRows, logs, profiles, reviewAnswers] = await Promise.all([
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
        db
          .select({
            card_id: reviewLogs.card_id,
            rating: reviewLogs.rating,
            state: reviewLogs.state,
            review: reviewLogs.review,
          })
          .from(reviewLogs)
          .where(and(eq(reviewLogs.user_id, caller.userId), eq(reviewLogs.state, "review"))),
      ]);
      const answers = reviewAnswers.map((log) => ({ ...log, review: log.review.getTime() }));
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
            retention: computeTrueRetention(answers, new Set(deckCards.map((card) => card.id)), now),
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
      "Write the back for a front, following the style of the deck's existing cards. Nothing is saved. The deck needs at least one other card. For a word read in a book, pass the sentence as context so the back gives the sense it had there.",
    role: "editor",
    method: "POST",
    path: "/decks/:deck_id/generate-back",
    input: z.object({
      deck_id: deckId,
      front: cardContent.shape.front,
      context: z.string().trim().max(5000).optional().describe("The sentence the word was read in."),
    }),
    run: async (caller, input) => {
      await mustFindDeck(caller.userId, input.deck_id);
      return {
        back: await generateBackForDeck({ deckId: input.deck_id, front: input.front, context: input.context }),
      };
    },
  }),

  defineOperation({
    name: "add-word",
    title: "Add word",
    description:
      "Add a word met while reading as a card. The back is written for the sense the word has in `context`, in the deck's style. A word already in the deck isn't added again, so retrying is safe. Without a deck, the word goes to a deck named \"Kindle\", created if needed.",
    role: "editor",
    method: "POST",
    path: "/words",
    input: z.object({
      deck_id: deckId.optional(),
      word: z.string().trim().min(1).max(200),
      context: z.string().trim().max(5000).optional().describe("The sentence the word was read in."),
    }),
    run: async (caller, input) => {
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

      return { card: presentCard(card), deck: presentDeck(deck), created };
    },
  }),

  defineOperation({
    name: "sync-reading",
    title: "Sync reading data",
    description:
      "Send books, every page visit, highlights and bookmarks, and looked-up words from an e-reader, and the keys of books deleted from it. What was deleted on the device goes too: removed_highlight_ids and removed_lookup_ids by id, and book_page_reads lists every page visit a book still has, so its others are deleted. Page visits sent with imported: true came from another reader's history, so book_page_reads never deletes them. Rows are matched on the ids and book keys the device sends, so sending the same data again changes nothing. For more than fits in one call, write this same input to a JSON file and use import-reading.",
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
        book_page_reads: input.book_page_reads.length,
        removed_highlights: input.removed_highlight_ids.length,
        removed_lookups: input.removed_lookup_ids.length,
        removed_books: input.removed_book_keys.length,
      };
    },
  }),

  defineOperation({
    name: "import-reading",
    title: "Import reading data",
    description:
      "sync-reading for a JSON file on disk, for reading data too big to pass in a call, like a reader's whole history. The file holds sync-reading's input. Returns `command`: run it on the machine that has the file. It uploads the file straight to storage, then applies it and prints how many rows it took; the data never passes through this call. Programs calling the REST API can do the same without curl: PUT the file to `upload_url`, then POST to `finish_url`. The links work for an hour.",
    role: "editor",
    method: "POST",
    path: "/reading/imports",
    input: z.object({
      path: z.string().trim().min(1).describe("The JSON file's path on the machine that will run the command."),
    }),
    run: async (caller, input) => {
      const upload = await startReadingImport(caller.userId);
      return {
        command: uploadCommand(input.path, upload.uploadUrl, upload.finishUrl),
        upload_url: upload.uploadUrl,
        finish_url: upload.finishUrl,
        expires_at: upload.expiresAt.toISOString(),
      };
    },
  }),

  defineOperation({
    name: "list-books",
    title: "List books",
    description: "Books from the user's e-readers, most recently read first. key is the e-reader's id for the book's file, which sync-reading matches books on.",
    role: "viewer",
    method: "GET",
    path: "/books",
    input: z.object({}),
    run: async (caller) => {
      const rows = await db
        .select()
        .from(books)
        .where(eq(books.user_id, caller.userId))
        .orderBy(sql`${books.last_read_at} desc nulls last`, asc(books.title));
      return {
        books: rows.map((book) => ({
          id: book.id,
          key: book.key,
          title: book.title,
          authors: book.authors,
          status: book.status,
          progress: book.progress,
          pages: book.pages,
          last_read_at: book.last_read_at?.toISOString() ?? null,
          finished_at: book.finished_at?.toISOString() ?? null,
        })),
      };
    },
  }),

  defineOperation({
    name: "get-reading-days",
    title: "Get reading days",
    description:
      "Time read on each of the last days, oldest first, with the daily goal, the streak (consecutive days that reached the goal, up to today), all the time ever read, and how many books are finished, in all and this year. Days are cut on the clock utc_offset_minutes ahead of UTC.",
    role: "viewer",
    method: "GET",
    path: "/reading/days",
    input: z.object({
      utc_offset_minutes: z.coerce.number().int().min(-720).max(840).default(0),
      days: z.coerce.number().int().min(1).max(366).default(365),
    }),
    run: async (caller, input) => {
      const [goal] = await db.select().from(readingGoals).where(eq(readingGoals.user_id, caller.userId));
      const dailyMinutes = goal?.daily_minutes ?? DEFAULT_DAILY_GOAL_MINUTES;
      const dayStartsAt = goal?.day_starts_at ?? DEFAULT_DAY_STARTS_AT;
      const reads = await db
        .select({ started_at: pageReads.started_at, seconds: pageReads.seconds })
        .from(pageReads)
        .where(eq(pageReads.user_id, caller.userId));
      const totals = secondsByDayAtOffset(
        reads.map((read) => ({ started_at: read.started_at.getTime(), seconds: read.seconds })),
        input.utc_offset_minutes,
        dayStartsAt,
      );
      const today = dayKeyAtOffset(Date.now(), input.utc_offset_minutes, dayStartsAt);
      const finished = await db
        .select({ finished_at: books.finished_at })
        .from(books)
        .where(and(eq(books.user_id, caller.userId), eq(books.status, "finished")));
      const year = today.slice(0, 4);
      const finishedThisYear = finished.filter(
        (book) => book.finished_at && dayKeyAtOffset(book.finished_at.getTime(), input.utc_offset_minutes).startsWith(year),
      ).length;
      return {
        goal: { daily_minutes: dailyMinutes, day_starts_at: dayStartsAt },
        streak: streakEndingOn(totals, today, dailyMinutes * 60),
        total_seconds: reads.reduce((sum, read) => sum + read.seconds, 0),
        finished_books: finished.length,
        finished_this_year: finishedThisYear,
        days: daysEndingOn(totals, today, input.days),
      };
    },
  }),

  defineOperation({
    name: "list-reading-sessions",
    title: "List reading sessions",
    description:
      "Reading sessions, newest first: one book's page turns with no pause longer than ten minutes. Pass a session's book_id, started_at and ended_at to delete-reading-session to delete it.",
    role: "viewer",
    method: "GET",
    path: "/reading/sessions",
    input: z.object({
      book_id: bookId.optional(),
      from: isoTime.optional().describe("Only sessions that started at or after this time."),
      to: isoTime.optional().describe("Only sessions that started before this time."),
      limit: z.coerce.number().int().min(1).max(500).default(50),
    }),
    run: async (caller, input) => {
      const reads = await db
        .select({
          book_id: pageReads.book_id,
          page: pageReads.page,
          started_at: pageReads.started_at,
          seconds: pageReads.seconds,
        })
        .from(pageReads)
        .where(
          and(
            eq(pageReads.user_id, caller.userId),
            input.book_id ? eq(pageReads.book_id, input.book_id) : undefined,
          ),
        );
      const from = input.from ? Date.parse(input.from) : -Infinity;
      const to = input.to ? Date.parse(input.to) : Infinity;
      const sessions = readingSessions(reads.map((read) => ({ ...read, started_at: read.started_at.getTime() })))
        .filter((session) => session.started_at >= from && session.started_at < to)
        .slice(0, input.limit);
      const titles = new Map(
        (await db.select({ id: books.id, title: books.title }).from(books).where(eq(books.user_id, caller.userId)))
          .map((book) => [book.id, book.title]),
      );
      return {
        sessions: sessions.map((session) => ({
          book_id: session.book_id,
          book_title: titles.get(session.book_id) ?? null,
          started_at: new Date(session.started_at).toISOString(),
          ended_at: new Date(session.ended_at).toISOString(),
          seconds: session.seconds,
          pages: session.pages,
        })),
      };
    },
  }),

  defineOperation({
    name: "delete-reading-session",
    title: "Delete reading session",
    description: `Delete a reading session from list-reading-sessions: the book's page visits that started between started_at and ended_at. ${STILL_ON_DEVICE}`,
    role: "admin",
    method: "DELETE",
    path: "/reading/sessions",
    input: z.object({ book_id: bookId, started_at: isoTime, ended_at: isoTime }),
    run: async (caller, input) => {
      const started_at = Date.parse(input.started_at);
      const ended_at = Date.parse(input.ended_at);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pageReads)
        .where(
          and(
            eq(pageReads.user_id, caller.userId),
            eq(pageReads.book_id, input.book_id),
            gte(pageReads.started_at, new Date(started_at)),
            lte(pageReads.started_at, new Date(ended_at)),
          ),
        );
      if (count === 0) throw new ApiError("NOT_FOUND", "There's no reading in that book at that time.");
      await runMutator(caller.userId, serverMutators.reading.deleteSession, {
        book_id: input.book_id,
        started_at,
        ended_at,
      });
      return { deleted_page_reads: count };
    },
  }),

  defineOperation({
    name: "list-highlights",
    title: "List highlights",
    description: "Highlights and bookmarks made on the user's e-readers, newest first.",
    role: "viewer",
    method: "GET",
    path: "/highlights",
    input: z.object({
      book_id: bookId.optional(),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    run: async (caller, input) => {
      const rows = await db
        .select()
        .from(highlights)
        .where(
          and(
            eq(highlights.user_id, caller.userId),
            input.book_id ? eq(highlights.book_id, input.book_id) : undefined,
          ),
        )
        .orderBy(desc(highlights.highlighted_at), desc(highlights.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      return {
        highlights: rows.slice(0, input.limit).map((highlight) => ({
          id: highlight.id,
          book_id: highlight.book_id,
          kind: highlight.kind,
          text: highlight.text,
          note: highlight.note,
          chapter: highlight.chapter,
          page: highlight.page,
          highlighted_at: highlight.highlighted_at.toISOString(),
        })),
        has_more: rows.length > input.limit,
      };
    },
  }),

  defineOperation({
    name: "delete-highlight",
    title: "Delete highlight",
    description: `Delete a highlight or bookmark. ${STILL_ON_DEVICE}`,
    role: "admin",
    method: "DELETE",
    path: "/highlights/:highlight_id",
    input: z.object({ highlight_id: z.uuid().describe("The highlight's id.") }),
    run: async (caller, input) => {
      const [highlight] = await db
        .select({ id: highlights.id })
        .from(highlights)
        .where(and(eq(highlights.id, input.highlight_id), eq(highlights.user_id, caller.userId)));
      if (!highlight) throw new ApiError("NOT_FOUND", "That highlight doesn't exist.");
      await runMutator(caller.userId, serverMutators.reading.deleteHighlight, { id: input.highlight_id });
      return { deleted: true };
    },
  }),

  defineOperation({
    name: "list-lookups",
    title: "List looked-up words",
    description: "Words the user looked up while reading, newest first.",
    role: "viewer",
    method: "GET",
    path: "/lookups",
    input: z.object({
      book_id: bookId.optional(),
      search: z.string().trim().min(1).optional().describe("Case-insensitive text to look for in the word."),
      limit: z.coerce.number().int().min(1).max(500).default(100),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    run: async (caller, input) => {
      const pattern = input.search && `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
      const rows = await db
        .select()
        .from(lookups)
        .where(
          and(
            eq(lookups.user_id, caller.userId),
            input.book_id ? eq(lookups.book_id, input.book_id) : undefined,
            pattern ? ilike(lookups.word, pattern) : undefined,
          ),
        )
        .orderBy(desc(lookups.looked_up_at), desc(lookups.id))
        .limit(input.limit + 1)
        .offset(input.offset);
      return {
        lookups: rows.slice(0, input.limit).map((lookup) => ({
          id: lookup.id,
          book_id: lookup.book_id,
          word: lookup.word,
          context: lookup.context,
          looked_up_at: lookup.looked_up_at.toISOString(),
        })),
        has_more: rows.length > input.limit,
      };
    },
  }),

  defineOperation({
    name: "delete-lookup",
    title: "Delete looked-up word",
    description: `Delete a looked-up word. Cards made from it stay. ${STILL_ON_DEVICE}`,
    role: "admin",
    method: "DELETE",
    path: "/lookups/:lookup_id",
    input: z.object({ lookup_id: z.uuid().describe("The look-up's id.") }),
    run: async (caller, input) => {
      const [lookup] = await db
        .select({ id: lookups.id })
        .from(lookups)
        .where(and(eq(lookups.id, input.lookup_id), eq(lookups.user_id, caller.userId)));
      if (!lookup) throw new ApiError("NOT_FOUND", "That look-up doesn't exist.");
      await runMutator(caller.userId, serverMutators.reading.deleteLookup, { id: input.lookup_id });
      return { deleted: true };
    },
  }),

  defineOperation({
    name: "send-book",
    title: "Send book to Kindle",
    description: `Send a book to the user's Kindle; it downloads the next time the Kindle syncs. Use this when the book is online: pass \`url\`, a direct link to the file (not a web page about it), and the server downloads it. For a file on disk, use upload-book instead. \`content_base64\` with \`file_name\` carries the whole file inside this request: fine for a program calling the REST API, but an agent would have to write the file out itself, so agents use it only for files of a few KB. Books can be ${SENDABLE_BOOK_EXTENSIONS.join(", ")}, up to 100 MB.`,
    role: "editor",
    method: "POST",
    path: "/sent-books",
    input: z
      .object({
        url: z.url().optional().describe("A link to the book file."),
        content_base64: z.string().min(1).optional().describe("The book file, base64-encoded."),
        file_name: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("The file name with its extension, like dune.epub. Needed with content_base64; with url it's taken from the download when left out."),
        title: z.string().trim().min(1).optional().describe("Defaults to the file name without its extension."),
      })
      .refine((input) => Boolean(input.url) !== Boolean(input.content_base64), {
        message: "Pass either url or content_base64.",
      })
      .refine((input) => !input.content_base64 || input.file_name, {
        message: "file_name is needed with content_base64.",
        path: ["file_name"],
      }),
    run: async (caller, input) => {
      const file = input.url
        ? await downloadBook(input.url, input.file_name)
        : { fileName: input.file_name!, bytes: Buffer.from(input.content_base64!, "base64") };
      const book = await saveSentBook(caller.userId, file.fileName, file.bytes, input.title);
      return { book: presentSentBook(book) };
    },
  }),

  defineOperation({
    name: "upload-book",
    title: "Upload book to Kindle",
    description: `Send a book file on disk to the user's Kindle, any size up to 100 MB. Returns \`command\`: run it on the machine that has the file. It uploads the file straight from disk to storage, then sends it, and prints the sent book as JSON; the file never passes through this call. Use this whenever you have the file and can run commands; use send-book with \`url\` when the book is at a public link instead. Programs calling the REST API can do the same without curl: PUT the file to \`upload_url\`, then POST to \`finish_url\`. The links work for an hour. Books can be ${SENDABLE_BOOK_EXTENSIONS.join(", ")}.`,
    role: "editor",
    method: "POST",
    path: "/sent-books/uploads",
    input: z.object({
      path: z
        .string()
        .trim()
        .min(1)
        .describe("The book file's path on the machine that will run the command, like ~/Books/dune.epub. Its name becomes the book's file name."),
      title: z.string().trim().min(1).optional().describe("Defaults to the file name without its extension."),
    }),
    run: async (caller, input) => {
      const fileName = fileNameOfPath(input.path);
      const upload = await startBookUpload(caller.userId, fileName, input.title);
      return {
        file_name: fileName,
        command: uploadCommand(input.path, upload.uploadUrl, upload.finishUrl),
        upload_url: upload.uploadUrl,
        finish_url: upload.finishUrl,
        expires_at: upload.expiresAt.toISOString(),
      };
    },
  }),

  defineOperation({
    name: "list-sent-books",
    title: "List sent books",
    description: "Books sent to the user's Kindle, newest first. delivered_at is null until the Kindle has downloaded it.",
    role: "viewer",
    method: "GET",
    path: "/sent-books",
    input: z.object({}),
    run: async (caller) => {
      const rows = await db
        .select()
        .from(sentBooks)
        .where(eq(sentBooks.user_id, caller.userId))
        .orderBy(desc(sentBooks.created_at));
      return { books: rows.map(presentSentBook) };
    },
  }),

  defineOperation({
    name: "delete-sent-book",
    title: "Delete sent book",
    description: "Take back a sent book. If the Kindle already downloaded it, it stays on the Kindle.",
    role: "admin",
    method: "DELETE",
    path: "/sent-books/:sent_book_id",
    input: z.object({ sent_book_id: z.uuid().describe("The sent book's id, from list-sent-books.") }),
    run: async (caller, input) => {
      await deleteSentBook(caller.userId, input.sent_book_id);
      return { deleted: true };
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
      "The cards to study in a deck right now, in the order the app shows them, within the deck's daily limits. Show the front, let the user answer, then show the back and record the answer with review-card. Each card's `next` says when each rating would bring it back. Day boundaries are UTC.",
    role: "viewer",
    method: "GET",
    path: "/decks/:deck_id/study",
    input: z.object({
      deck_id: deckId,
      limit: z.coerce.number().int().min(1).max(200).default(20),
    }),
    run: async (caller, input) => {
      const deck = await mustFindDeck(caller.userId, input.deck_id);
      const { buckets, profile } = await studyBuckets(caller.userId, deck);
      const queue = [...buckets.newCards, ...buckets.learningCards, ...buckets.reviewCards];
      const scheduler = createUserScheduler(profile);
      const now = new Date();
      return {
        new_count: buckets.newCards.length,
        learning_count: buckets.learningCards.length,
        due_count: buckets.reviewCards.length,
        cards: queue.slice(0, input.limit).map((card) => ({
          ...presentCard(card.row),
          next: ratingPreviews(scheduler, card.row, now),
        })),
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
      reviewed_at: isoTime
        .optional()
        .describe("When the answer was given, for answers recorded offline. Defaults to now."),
      review_id: z
        .uuid()
        .optional()
        .describe("An id for this answer, so sending it again records it once."),
    }),
    run: async (caller, input) => {
      const card = await mustFindCard(caller.userId, input.card_id);
      const deck = await mustFindDeck(caller.userId, card.deck_id);
      const profile = await mustFindProfile(caller.userId, deck.learning_profile_id);
      const scheduler = createUserScheduler(profile);

      const reviewId = input.review_id ?? crypto.randomUUID();
      const [recorded] = await db
        .select({ id: reviewLogs.id })
        .from(reviewLogs)
        .where(and(eq(reviewLogs.id, reviewId), eq(reviewLogs.user_id, caller.userId)))
        .limit(1);
      if (recorded) {
        return { card: presentCard(card), next: ratingPreviews(scheduler, card, new Date()) };
      }

      const now = new Date(Math.min(Date.now(), input.reviewed_at ? Date.parse(input.reviewed_at) : Date.now()));
      if (card.last_review && card.last_review > now) {
        throw new ApiError("PRECONDITION_FAILED", "This card was reviewed again after that answer.");
      }
      const result = scheduler.next(dbRowToFSRSCard(card), now, RATINGS[input.rating]);
      const cardPatch = fsrsCardToDbRow(result.card);
      const log = reviewLogToDbRow(result.log, card.id, input.duration_ms);
      await runMutator(caller.userId, serverMutators.card.rate, {
        card_id: card.id,
        review_log_id: reviewId,
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
      const updated = await mustFindCard(caller.userId, card.id);
      return { card: presentCard(updated), next: ratingPreviews(scheduler, updated, new Date()) };
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
