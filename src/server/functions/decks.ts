import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { decks, learningProfiles } from "@/server/db/schema";
import { readTxid, requireUserId } from "./_helpers";

/**
 * Deck write path. Each function runs inside a single Postgres transaction and
 * returns `{ txid }` so the Electric collection can hold optimistic state until
 * the same change syncs back. `user_id` is always taken from the session.
 */

const deckInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  description: z.string(),
  learning_profile_id: z.uuid(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const createDeckFn = createServerFn({ method: "POST" })
  .inputValidator(deckInput)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const [profile] = await tx
        .select({ id: learningProfiles.id })
        .from(learningProfiles)
        .where(
          and(
            eq(learningProfiles.id, data.learning_profile_id),
            eq(learningProfiles.user_id, userId),
          ),
        )
        .limit(1);
      if (!profile) throw new Error("FORBIDDEN");

      await tx.insert(decks).values({
        id: data.id,
        user_id: userId,
        name: data.name,
        description: data.description,
        learning_profile_id: data.learning_profile_id,
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at),
      });
      return { txid: await readTxid(tx) };
    });
  });

export const updateDeckFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(1),
      description: z.string(),
      learning_profile_id: z.uuid(),
      updated_at: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const result = await tx
        .update(decks)
        .set({
          name: data.name,
          description: data.description,
          learning_profile_id: data.learning_profile_id,
          updated_at: new Date(data.updated_at),
        })
        .where(and(eq(decks.id, data.id), eq(decks.user_id, userId)))
        .returning({ id: decks.id });
      if (result.length === 0) throw new Error("NOT_FOUND");
      return { txid: await readTxid(tx) };
    });
  });

export const deleteDeckFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const result = await tx
        .delete(decks)
        .where(and(eq(decks.id, data.id), eq(decks.user_id, userId)))
        .returning({ id: decks.id });
      if (result.length === 0) throw new Error("NOT_FOUND");
      return { txid: await readTxid(tx) };
    });
  });
