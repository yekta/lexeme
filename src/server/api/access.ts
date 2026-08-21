import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { db } from "@/server/db";
import { decks } from "@/server/db/schema";

type Database = typeof db;
type DeckRow = typeof decks.$inferSelect;

/**
 * Central deck access rule, and the one seam sharing will plug into.
 *
 * The card and profile equivalents that used to live here are gone: those
 * checks are in the shared Zero mutators now, where the same function runs
 * optimistically on the client and authoritatively on the server. This one
 * stays because `decks.export` is still a tRPC procedure.
 * Today decks are owner-only. When sharing lands, extend this to also grant
 * access to shared-with users (and add a read/write distinction here).
 */
export function canAccessDeck({
  deck,
  userId,
}: {
  deck: DeckRow;
  userId: string;
}): boolean {
  return deck.user_id === userId;
}

/**
 * Load a deck by id and assert the current user may access it.
 * Throws NOT_FOUND when no such deck exists, FORBIDDEN when it exists but
 * isn't accessible. The lookup is intentionally unscoped by user so the two
 * cases stay distinguishable.
 */
export async function requireDeck({
  db,
  deckId,
  userId,
}: {
  db: Database;
  deckId: string;
  userId: string;
}): Promise<DeckRow> {
  const [deck] = await db
    .select()
    .from(decks)
    .where(eq(decks.id, deckId))
    .limit(1);
  if (!deck) throw new TRPCError({ code: "NOT_FOUND" });
  if (!canAccessDeck({ deck, userId })) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return deck;
}
