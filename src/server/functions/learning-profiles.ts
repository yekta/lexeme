import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { learningProfiles } from "@/server/db/schema";
import { readTxid, requireUserId } from "./_helpers";

/** Learning-profile write path. Mirrors the deck functions. */

export const createLearningProfileFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(1),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      await tx.insert(learningProfiles).values({
        id: data.id,
        user_id: userId,
        name: data.name,
        is_default: false,
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at),
      });
      return { txid: await readTxid(tx) };
    });
  });

export const updateLearningProfileFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.uuid(),
      name: z.string().trim().min(1).optional(),
      new_cards_per_day: z.number().int().min(0).optional(),
      max_reviews_per_day: z.number().int().min(0).optional(),
      request_retention: z.number().min(0).max(1).optional(),
      maximum_interval: z.number().int().min(1).optional(),
      w: z.array(z.number()).optional(),
      enable_fuzz: z.boolean().optional(),
      enable_short_term: z.boolean().optional(),
      learning_steps: z.array(z.string()).optional(),
      relearning_steps: z.array(z.string()).optional(),
      updated_at: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const { id, updated_at, ...fields } = data;
    return db.transaction(async (tx) => {
      const result = await tx
        .update(learningProfiles)
        .set({ ...fields, updated_at: new Date(updated_at) })
        .where(
          and(
            eq(learningProfiles.id, id),
            eq(learningProfiles.user_id, userId),
          ),
        )
        .returning({ id: learningProfiles.id });
      if (result.length === 0) throw new Error("NOT_FOUND");
      return { txid: await readTxid(tx) };
    });
  });

export const deleteLearningProfileFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    return db.transaction(async (tx) => {
      const result = await tx
        .delete(learningProfiles)
        .where(
          and(
            eq(learningProfiles.id, data.id),
            eq(learningProfiles.user_id, userId),
            eq(learningProfiles.is_default, false),
          ),
        )
        .returning({ id: learningProfiles.id });
      if (result.length === 0) throw new Error("FORBIDDEN");
      return { txid: await readTxid(tx) };
    });
  });
