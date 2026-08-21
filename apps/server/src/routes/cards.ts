import { generateBackRequest, generateCardRequest } from "@lexeme/contracts";
import { cards } from "@lexeme/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";

import { requireDeck } from "../access.ts";
import { generateBack } from "../ai/generate-back.ts";
import { generateCard } from "../ai/generate-card.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { parseBody, requireUserId } from "../http.ts";

/**
 * What is left of cards on HTTP: the two model calls.
 *
 * Everything else about a card — creating, editing, rating, deleting — is a
 * shared Zero mutator that runs against the local store first and reaches
 * Postgres when the network allows. These two have no local equivalent: they
 * call a model with an API key that must never reach a browser, and they read
 * deck context the client already holds only so the prompt stays server-side.
 */

/** Cards shown to the model as examples of the user's conventions. */
const BACK_CONTEXT_LIMIT = 20;
/** Fronts shown to the model so it does not suggest one the deck already has. */
const FRONT_CONTEXT_LIMIT = 10_000;

export const cardRoutes = new Hono()
  .post("/generate-back", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, generateBackRequest);
    await requireDeck({ deckId: input.deckId, userId });

    const recentCards = await db
      .select({ front: cards.front, back: cards.back })
      .from(cards)
      .where(and(eq(cards.deck_id, input.deckId), ne(cards.front, input.front)))
      .orderBy(desc(cards.created_at))
      .limit(BACK_CONTEXT_LIMIT);

    if (recentCards.length === 0) {
      throw new ApiError(
        "PRECONDITION_FAILED",
        "Add at least one card before generating a back.",
      );
    }

    return c.json({ back: await generateBack({ front: input.front, recentCards }) });
  })
  .post("/generate-card", async (c) => {
    const userId = await requireUserId(c);
    const input = await parseBody(c, generateCardRequest);
    await requireDeck({ deckId: input.deckId, userId });

    const [existingFronts, recentCards] = await Promise.all([
      db
        .select({ front: cards.front })
        .from(cards)
        .where(eq(cards.deck_id, input.deckId))
        .orderBy(desc(cards.created_at))
        .limit(FRONT_CONTEXT_LIMIT),
      db
        .select({ front: cards.front, back: cards.back })
        .from(cards)
        .where(eq(cards.deck_id, input.deckId))
        .orderBy(desc(cards.created_at))
        .limit(BACK_CONTEXT_LIMIT),
    ]);

    if (existingFronts.length === 0) {
      throw new ApiError(
        "PRECONDITION_FAILED",
        "Add at least one card before suggesting a new one.",
      );
    }

    return c.json(
      await generateCard({
        existingFronts: existingFronts.map((card) => card.front),
        rejectedFronts: input.excludeFronts,
        recentCards,
      }),
    );
  });
