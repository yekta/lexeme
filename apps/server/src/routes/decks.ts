import { DECK_EXPORT_KIND, DECK_EXPORT_VERSION, type DeckExport } from "@lexeme/shared";
import { cards } from "@lexeme/db";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { requireDeck } from "../access.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { requireUserId } from "../http.ts";

/**
 * What is left of decks on HTTP: the export snapshot.
 *
 * Deck reads and writes are Zero synced queries and shared mutators, answered
 * from the browser's own store. Export stays here because it is a
 * server-rendered artefact rather than a view of the synced rows: it strips
 * ids, FSRS state and the profile reference so a re-import starts fresh and
 * lets the user pick their own profile.
 */
export const deckRoutes = new Hono().get("/:id/export", async (c) => {
  const userId = await requireUserId(c);
  const id = z.uuid().safeParse(c.req.param("id"));
  if (!id.success) throw new ApiError("BAD_REQUEST", "Not a deck id.");

  const deck = await requireDeck({ deckId: id.data, userId });
  const rows = await db
    .select({ front: cards.front, back: cards.back })
    .from(cards)
    .where(eq(cards.deck_id, deck.id))
    .orderBy(asc(cards.created_at));

  return c.json({
    version: DECK_EXPORT_VERSION,
    kind: DECK_EXPORT_KIND,
    deck: { name: deck.name, description: deck.description },
    cards: rows,
  } satisfies DeckExport);
});
