import { defineQueries, defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { zql } from "./schema.ts";

/**
 * The synced queries. The same definitions run on the client (against the local
 * store) and on the server (`/api/zero/query`), where `ctx` comes from the
 * verified session, so the `user_id` filters below ARE the access control.
 *
 * Every one is whole-table-per-user, because that is what the app already
 * assumes: the deck badges, the study queue and the retention numbers are all
 * derived in JS from the full card and review-log sets (see
 * `lib/study-buckets.ts`), and search-free local computation over the whole
 * archive is the point of holding it on the device.
 */

const deckArgs = z.object({ deck_id: z.string() });

export const queries = defineQueries({
  /** Every deck the user owns. */
  decks: defineQuery(({ ctx }) => zql.decks.where("user_id", ctx.user_id)),

  /**
   * Every card the user owns, across all decks. The deck list needs all of
   * them at once for its per-deck counts, so there is no narrower shape that
   * would save anything on the home screen.
   */
  cards: defineQuery(({ ctx }) => zql.cards.where("user_id", ctx.user_id)),

  /**
   * One deck's cards. Served from the local store once `cards` has preloaded;
   * it exists so the deck and study screens narrow incrementally in Zero rather
   * than re-filtering the whole set in JS on every keystroke-sized change.
   */
  cardsByDeck: defineQuery(deckArgs, ({ args, ctx }) =>
    zql.cards.where("user_id", ctx.user_id).where("deck_id", args.deck_id),
  ),

  /** The user's FSRS profiles. */
  learningProfiles: defineQuery(({ ctx }) =>
    zql.learning_profiles.where("user_id", ctx.user_id),
  ),

  /**
   * The user's full review history.
   *
   * The heaviest table by far and the last thing the UI needs: only the deck
   * badges' retention figure, today's counts and the calibration pass read it.
   * It is preloaded behind the others for exactly that reason (see
   * `zero/preload.ts`).
   */
  reviewLogs: defineQuery(({ ctx }) =>
    zql.review_logs.where("user_id", ctx.user_id),
  ),
});
