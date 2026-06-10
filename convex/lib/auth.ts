import { ConvexError } from "convex/values";

import { authComponent } from "../auth";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

/** The current user's id, or throw UNAUTHORIZED. */
export async function requireUserId(ctx: Ctx): Promise<string> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new ConvexError({ code: "UNAUTHORIZED" });
  return user._id;
}

/**
 * Load a deck and assert the user may access it. NOT_FOUND when it doesn't
 * exist (or the id is malformed), FORBIDDEN when it's owned by someone else.
 * Mirrors src/server/api/access.ts.
 */
export async function requireDeck(
  ctx: Ctx,
  deckId: string,
  userId: string,
): Promise<Doc<"decks">> {
  const id = ctx.db.normalizeId("decks", deckId);
  const deck = id ? await ctx.db.get(id) : null;
  if (!deck) throw new ConvexError({ code: "NOT_FOUND" });
  if (deck.user_id !== userId) throw new ConvexError({ code: "FORBIDDEN" });
  return deck;
}

export async function requireCard(
  ctx: Ctx,
  cardId: string,
  userId: string,
): Promise<Doc<"cards">> {
  const id = ctx.db.normalizeId("cards", cardId);
  const card = id ? await ctx.db.get(id) : null;
  if (!card) throw new ConvexError({ code: "NOT_FOUND" });
  if (card.user_id !== userId) throw new ConvexError({ code: "FORBIDDEN" });
  return card;
}

export async function requireProfile(
  ctx: Ctx,
  profileId: string,
  userId: string,
): Promise<Doc<"learningProfiles">> {
  const id = ctx.db.normalizeId("learningProfiles", profileId);
  const profile = id ? await ctx.db.get(id) : null;
  if (!profile) throw new ConvexError({ code: "NOT_FOUND" });
  if (profile.user_id !== userId) throw new ConvexError({ code: "FORBIDDEN" });
  return profile;
}

export type { Id };
