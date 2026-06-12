import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  type DeckExport,
} from "@/lib/deck-export";
import { requireDeck, requireProfile } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards, decks } from "@/server/db/schema";
import { generateTxId } from "@/server/db/txid";

// Reads come from Electric shapes (see src/db/collections.ts); this router
// only carries writes. Every mutation runs in one transaction and returns the
// Postgres txid so the client can await that transaction on the shape stream.
export const decksRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1),
        description: z.string().trim(),
        learning_profile_id: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProfile({
        db: ctx.db,
        userId: ctx.session.user.id,
        profileId: input.learning_profile_id,
      });

      // The id is generated on the client so it can be used immediately for
      // the optimistic row and navigation; we just persist it here.
      // onConflictDoNothing keeps the durable-outbox replay idempotent: a
      // retry after a prior success is a no-op, not a duplicate-key error.
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx
          .insert(decks)
          .values({
            id: input.id,
            user_id: ctx.session.user.id,
            name: input.name,
            description: input.description,
            learning_profile_id: input.learning_profile_id,
          })
          .onConflictDoNothing();
        return { txid };
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1),
        description: z.string().trim(),
        learning_profile_id: z.uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.id,
        userId: ctx.session.user.id,
      });
      await requireProfile({
        db: ctx.db,
        profileId: input.learning_profile_id,
        userId: ctx.session.user.id,
      });
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx
          .update(decks)
          .set({
            name: input.name,
            description: input.description,
            learning_profile_id: input.learning_profile_id,
          })
          .where(eq(decks.id, input.id));
        return { txid };
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.id,
        userId: ctx.session.user.id,
      });
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx.delete(decks).where(eq(decks.id, input.id));
        return { txid };
      });
    }),

  /**
   * Create a deck and all its cards atomically. Used by the import flow so
   * either the whole deck lands or nothing does — no orphan empty decks if
   * the card insert fails halfway.
   */
  import: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1),
        description: z.string().trim(),
        learning_profile_id: z.uuid(),
        cards: z.array(
          z.object({
            id: z.uuid(),
            front: z.string().trim().min(1),
            back: z.string().trim().min(1),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireProfile({
        db: ctx.db,
        userId: ctx.session.user.id,
        profileId: input.learning_profile_id,
      });

      // onConflictDoNothing on every insert keeps an outbox replay of this
      // import idempotent (a retry after a prior success is a no-op).
      return ctx.db.transaction(async (tx) => {
        const txid = await generateTxId(tx);
        await tx
          .insert(decks)
          .values({
            id: input.id,
            user_id: ctx.session.user.id,
            name: input.name,
            description: input.description,
            learning_profile_id: input.learning_profile_id,
          })
          .onConflictDoNothing();
        if (input.cards.length > 0) {
          await tx
            .insert(cards)
            .values(
              input.cards.map((c) => ({
                id: c.id,
                deck_id: input.id,
                user_id: ctx.session.user.id,
                front: c.front,
                back: c.back,
              })),
            )
            .onConflictDoNothing();
        }
        return { txid };
      });
    }),

  /**
   * Snapshot a deck and its cards as a portable payload. Strips ids, FSRS
   * state, and learning-profile reference so a re-import starts fresh and
   * lets the user pick their own profile.
   */
  export: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }): Promise<DeckExport> => {
      const deck = await requireDeck({
        db: ctx.db,
        deckId: input.id,
        userId: ctx.session.user.id,
      });
      const rows = await ctx.db
        .select({ front: cards.front, back: cards.back })
        .from(cards)
        .where(eq(cards.deck_id, deck.id))
        .orderBy(asc(cards.created_at));
      return {
        version: DECK_EXPORT_VERSION,
        kind: DECK_EXPORT_KIND,
        deck: { name: deck.name, description: deck.description },
        cards: rows,
      };
    }),
});
