import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  DECK_EXPORT_KIND,
  DECK_EXPORT_VERSION,
  type DeckExport,
} from "@/lib/deck-export";
import { requireDeck } from "@/server/api/access";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { cards } from "@/server/db/schema";

/**
 * What is left on tRPC: the export snapshot.
 *
 * Deck reads and writes are Zero synced queries and shared mutators now. Export
 * stays here because it is a server-rendered artefact rather than a view of the
 * synced rows — it strips ids, FSRS state and the profile reference so a
 * re-import starts fresh.
 */
export const decksRouter = createTRPCRouter({
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
