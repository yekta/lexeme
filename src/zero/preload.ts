import type { Zero } from "@rocicorp/zero";

import { queries } from "@/zero/queries";
import type { TSchema } from "@/zero/schema";

/**
 * Pull the whole account onto this device, in the order the screens need it.
 *
 * `ttl: "forever"` keeps every query registered even when nothing is rendering
 * it, which is what makes a reload paint from the local store instead of
 * waiting on the network, and what makes the app work with no network at all.
 *
 * Two passes, chained. Zero's `preload` takes a ttl and nothing else — there is
 * no priority flag — so firing everything at once lets zero-cache interleave
 * the review-log payload into the one the deck list is waiting on. Review logs
 * are by far the heaviest table (one row per answer, forever) and the last
 * thing anything needs: only the retention figure on the deck badges, today's
 * counts, and the calibration pass read them. Starting them when `cards`
 * completes is what keeps the first screen first.
 *
 * Module scope, and it must stay there: every prop of `ZeroProvider` (`init`
 * included) is a dependency of the effect that builds the client, and that
 * effect's cleanup closes it. An inline callback rebuilds the Zero client on
 * every render of whatever holds the provider.
 */
export function preloadAccount(zero: Zero<TSchema>): void {
  zero.preload(queries.learningProfiles(), { ttl: "forever" });
  zero.preload(queries.decks(), { ttl: "forever" });
  const cards = zero.preload(queries.cards(), { ttl: "forever" });
  void cards.complete.then(() => {
    zero.preload(queries.reviewLogs(), { ttl: "forever" });
  });
}
