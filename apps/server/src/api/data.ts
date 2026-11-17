import type { TAuthData } from "@lexeme/contracts";
import { cards, decks, learningProfiles } from "@lexeme/db";
import { and, eq } from "drizzle-orm";

import { db, dbProvider } from "../db.ts";
import { ApiError } from "../errors.ts";

type TServerTransaction = Parameters<Parameters<typeof dbProvider.transaction>[0]>[0];

type TMutator<TArgs> = {
  fn: (options: { tx: TServerTransaction; ctx: TAuthData; args: TArgs }) => Promise<void>;
};

/**
 * Runs a shared mutator authoritatively, exactly as `/api/zero/mutate` does,
 * so the API gets the same checks the app does and zero-cache syncs the result
 * to every open device.
 *
 * The mutators throw plain `Error`s with a message meant for the user; those
 * become a 400. Anything more specific (a Postgres error, a bug) stays a 500.
 */
export async function runMutator<TArgs>(
  userId: string,
  mutator: TMutator<TArgs>,
  args: TArgs,
): Promise<void> {
  try {
    await dbProvider.transaction((tx) =>
      mutator.fn({ tx, ctx: { user_id: userId }, args }),
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const isUserFacing =
      error.constructor === Error || error.name === "InputValidationError";
    if (!isUserFacing) throw error;
    throw new ApiError("BAD_REQUEST", error.message);
  }
}

/** Rows owned by someone else answer 404 too, so ids can't be probed. */
export async function mustFindDeck(userId: string, deckId: string) {
  const [deck] = await db
    .select()
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.user_id, userId)))
    .limit(1);
  if (!deck) throw new ApiError("NOT_FOUND", "That deck doesn't exist.");
  return deck;
}

export async function mustFindCard(userId: string, cardId: string) {
  const [card] = await db
    .select()
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.user_id, userId)))
    .limit(1);
  if (!card) throw new ApiError("NOT_FOUND", "That card doesn't exist.");
  return card;
}

export async function mustFindProfile(userId: string, profileId: string) {
  const [profile] = await db
    .select()
    .from(learningProfiles)
    .where(and(eq(learningProfiles.id, profileId), eq(learningProfiles.user_id, userId)))
    .limit(1);
  if (!profile) throw new ApiError("NOT_FOUND", "That learning profile doesn't exist.");
  return profile;
}

export async function defaultProfileId(userId: string): Promise<string> {
  const [profile] = await db
    .select({ id: learningProfiles.id })
    .from(learningProfiles)
    .where(and(eq(learningProfiles.user_id, userId), eq(learningProfiles.is_default, true)))
    .limit(1);
  if (!profile) throw new ApiError("PRECONDITION_FAILED", "This account has no default learning profile.");
  return profile.id;
}

type TDeckRow = typeof decks.$inferSelect;
type TCardRow = typeof cards.$inferSelect;
type TProfileRow = typeof learningProfiles.$inferSelect;

const iso = (date: Date | null) => date?.toISOString() ?? null;

export function presentDeck(deck: TDeckRow) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    learning_profile_id: deck.learning_profile_id,
    created_at: deck.created_at.toISOString(),
    updated_at: deck.updated_at.toISOString(),
  };
}

export function presentCard(card: TCardRow) {
  return {
    id: card.id,
    deck_id: card.deck_id,
    front: card.front,
    back: card.back,
    state: card.state,
    due: card.due.toISOString(),
    reps: card.reps,
    lapses: card.lapses,
    last_review: iso(card.last_review),
    created_at: card.created_at.toISOString(),
    updated_at: card.updated_at.toISOString(),
  };
}

export function presentProfile(profile: TProfileRow) {
  return {
    id: profile.id,
    name: profile.name,
    is_default: profile.is_default,
    new_cards_per_day: profile.new_cards_per_day,
    max_reviews_per_day: profile.max_reviews_per_day,
    request_retention: profile.request_retention,
    maximum_interval: profile.maximum_interval,
    enable_fuzz: profile.enable_fuzz,
    enable_short_term: profile.enable_short_term,
    learning_steps: profile.learning_steps,
    relearning_steps: profile.relearning_steps,
    last_calibrated_at: iso(profile.last_calibrated_at),
    created_at: profile.created_at.toISOString(),
    updated_at: profile.updated_at.toISOString(),
  };
}
