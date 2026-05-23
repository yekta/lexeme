import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  type DeckExport,
} from "@/lib/deck-export";
import { requireDeck, requireProfile } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cardContents, cards, decks } from "@/server/db/schema";

export const decksRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db
      .select({
        id: decks.id,
        name: decks.name,
        description: decks.description,
        learning_profile_id: decks.learning_profile_id,
        created_at: decks.created_at,
      })
      .from(decks)
      .where(eq(decks.user_id, ctx.session.user.id))
      .orderBy(desc(decks.created_at));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const deck = await requireDeck({
        db: ctx.db,
        deckId: input.id,
        userId: ctx.session.user.id,
      });
      return {
        id: deck.id,
        name: deck.name,
        description: deck.description,
        learning_profile_id: deck.learning_profile_id,
      };
    }),

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
      const [row] = await ctx.db
        .insert(decks)
        .values({
          id: input.id,
          user_id: ctx.session.user.id,
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        })
        .returning({ id: decks.id });
      return row!.id;
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
      await ctx.db
        .update(decks)
        .set({
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        })
        .where(eq(decks.id, input.id));
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireDeck({
        db: ctx.db,
        deckId: input.id,
        userId: ctx.session.user.id,
      });
      await ctx.db.delete(decks).where(eq(decks.id, input.id));
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

      await ctx.db.transaction(async (tx) => {
        await tx.insert(decks).values({
          id: input.id,
          user_id: ctx.session.user.id,
          name: input.name,
          description: input.description,
          learning_profile_id: input.learning_profile_id,
        });
        if (input.cards.length > 0) {
          await tx
            .insert(cards)
            .values(input.cards.map((c) => ({ id: c.id, deck_id: input.id })));
          await tx.insert(cardContents).values(
            input.cards.map((c) => ({
              card_id: c.id,
              front: c.front,
              back: c.back,
            })),
          );
        }
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
        .select({ front: cardContents.front, back: cardContents.back })
        .from(cards)
        .innerJoin(cardContents, eq(cardContents.card_id, cards.id))
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
