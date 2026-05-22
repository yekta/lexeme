import "server-only";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import type { db } from "@/server/db";
import { cards, decks, learningProfiles } from "@/server/db/schema";

type Database = typeof db;
type DeckRow = typeof decks.$inferSelect;
type CardRow = typeof cards.$inferSelect;
type ProfileRow = typeof learningProfiles.$inferSelect;

/**
 * Central deck access rule, and the one seam sharing will plug into.
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

/**
 * Load a card (with its deck) by id and assert the user may access it.
 * Throws NOT_FOUND when the card doesn't exist, FORBIDDEN when its deck
 * isn't accessible.
 */
export async function requireCard({
  db,
  cardId,
  userId,
}: {
  db: Database;
  cardId: string;
  userId: string;
}): Promise<{ card: CardRow; deck: DeckRow }> {
  const [row] = await db
    .select({ card: cards, deck: decks })
    .from(cards)
    .innerJoin(decks, eq(decks.id, cards.deck_id))
    .where(eq(cards.id, cardId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  if (!canAccessDeck({ deck: row.deck, userId })) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return row;
}

/**
 * Load a learning profile by id and assert the current user owns it.
 * Throws NOT_FOUND when no such profile exists, FORBIDDEN when it isn't owned.
 */
export async function requireProfile({
  db,
  profileId,
  userId,
}: {
  db: Database;
  profileId: string;
  userId: string;
}): Promise<ProfileRow> {
  const [profile] = await db
    .select()
    .from(learningProfiles)
    .where(eq(learningProfiles.id, profileId))
    .limit(1);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
  if (profile.user_id !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return profile;
}
