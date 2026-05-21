import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { cardContents, cards, decks, reviewLogs } from "@/server/db/schema";
import { readTxid, requireUserId } from "./_helpers";

/**
 * Card write path. FSRS scheduling runs on the client (local-first); these
 * functions only validate ownership and persist the rows the client computed.
 * Compound operations (create card + content, rate = update card + log) run in
 * one transaction so a single `txid` covers every affected collection.
 */

const cardState = z.enum(["new", "learning", "review", "relearning"]);

const cardInput = z.object({
  id: z.uuid(),
  deck_id: z.uuid(),
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsed_days: z.number().int(),
  scheduled_days: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: cardState,
  learning_steps: z.number().int(),
  last_review: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const contentInput = z.object({
  id: z.uuid(),
  card_id: z.uuid(),
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
  created_at: z.string(),
  updated_at: z.string(),
});

/** Assert the deck exists and belongs to the user; returns nothing. */
async function assertDeckOwned(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  deckId: string,
  userId: string,
) {
  const [deck] = await tx
    .select({ id: decks.id })
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.user_id, userId)))
    .limit(1);
  if (!deck) throw new Error("FORBIDDEN");
}

export const createCardFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ card: cardInput, content: contentInput }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      await assertDeckOwned(tx, data.card.deck_id, userId);
      await tx.insert(cards).values({
        id: data.card.id,
        user_id: userId,
        deck_id: data.card.deck_id,
        due: new Date(data.card.due),
        stability: data.card.stability,
        difficulty: data.card.difficulty,
        elapsed_days: data.card.elapsed_days,
        scheduled_days: data.card.scheduled_days,
        reps: data.card.reps,
        lapses: data.card.lapses,
        state: data.card.state,
        learning_steps: data.card.learning_steps,
        last_review: data.card.last_review
          ? new Date(data.card.last_review)
          : null,
        created_at: new Date(data.card.created_at),
        updated_at: new Date(data.card.updated_at),
      });
      await tx.insert(cardContents).values({
        id: data.content.id,
        user_id: userId,
        card_id: data.content.card_id,
        front: data.content.front,
        back: data.content.back,
        created_at: new Date(data.content.created_at),
        updated_at: new Date(data.content.updated_at),
      });
      return { txid: await readTxid(tx) };
    });
  });

export const updateCardContentFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      card_id: z.uuid(),
      front: z.string().trim().min(1),
      back: z.string().trim().min(1),
      updated_at: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const result = await tx
        .update(cardContents)
        .set({
          front: data.front,
          back: data.back,
          updated_at: new Date(data.updated_at),
        })
        .where(
          and(
            eq(cardContents.card_id, data.card_id),
            eq(cardContents.user_id, userId),
          ),
        )
        .returning({ id: cardContents.id });
      if (result.length === 0) throw new Error("NOT_FOUND");
      return { txid: await readTxid(tx) };
    });
  });

export const deleteCardFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      // card_contents and review_logs cascade via FK on delete.
      const result = await tx
        .delete(cards)
        .where(and(eq(cards.id, data.id), eq(cards.user_id, userId)))
        .returning({ id: cards.id });
      if (result.length === 0) throw new Error("NOT_FOUND");
      return { txid: await readTxid(tx) };
    });
  });

export const rateCardFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      card: z.object({
        id: z.uuid(),
        due: z.string(),
        stability: z.number(),
        difficulty: z.number(),
        scheduled_days: z.number().int(),
        reps: z.number().int(),
        lapses: z.number().int(),
        state: cardState,
        learning_steps: z.number().int(),
        last_review: z.string().nullable(),
        updated_at: z.string(),
      }),
      log: z.object({
        id: z.uuid(),
        card_id: z.uuid(),
        rating: z.number().int(),
        state: cardState,
        due: z.string(),
        stability: z.number(),
        difficulty: z.number(),
        scheduled_days: z.number().int(),
        learning_steps: z.number().int(),
        review: z.string(),
        duration_ms: z.number().int().min(0),
        created_at: z.string(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(cards)
        .set({
          due: new Date(data.card.due),
          stability: data.card.stability,
          difficulty: data.card.difficulty,
          scheduled_days: data.card.scheduled_days,
          reps: data.card.reps,
          lapses: data.card.lapses,
          state: data.card.state,
          learning_steps: data.card.learning_steps,
          last_review: data.card.last_review
            ? new Date(data.card.last_review)
            : null,
          updated_at: new Date(data.card.updated_at),
        })
        .where(and(eq(cards.id, data.card.id), eq(cards.user_id, userId)))
        .returning({ id: cards.id });
      if (updated.length === 0) throw new Error("FORBIDDEN");

      await tx.insert(reviewLogs).values({
        id: data.log.id,
        user_id: userId,
        card_id: data.log.card_id,
        rating: data.log.rating,
        state: data.log.state,
        due: new Date(data.log.due),
        stability: data.log.stability,
        difficulty: data.log.difficulty,
        scheduled_days: data.log.scheduled_days,
        learning_steps: data.log.learning_steps,
        review: new Date(data.log.review),
        duration_ms: data.log.duration_ms,
        created_at: new Date(data.log.created_at),
      });
      return { txid: await readTxid(tx) };
    });
  });
