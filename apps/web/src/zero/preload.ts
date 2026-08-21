import type { Zero } from "@rocicorp/zero";
import { queries, type TSchema } from "@lexeme/contracts";
import { Store } from "@tanstack/store";
import { useSyncExternalStore } from "react";

/**
 * How far the preload has got, in module scope.
 *
 * Module-level rather than a hook's state because `preloadAccount` runs inside
 * the Zero provider's construction effect, and there is no component there to
 * hold it. Reset when a new client is built, which is what makes switching
 * accounts start the wait over instead of inheriting the last user's "done".
 */
type TPreloadState = {
  /** Decks, cards and learning profiles: everything a screen's shape depends on. */
  account: boolean;
  /** Review logs, which arrive behind them. */
  logs: boolean;
};

const preloaded = new Store<TPreloadState>({ account: false, logs: false });

function subscribe(onChange: () => void) {
  return preloaded.subscribe(onChange).unsubscribe;
}

/**
 * Which passes have completed a first sync for this client.
 *
 * Two flags rather than one because the preload is two passes, and the screens
 * care about the difference: the deck list needs the first, and the numbers on
 * it — today's counts, retention, the daily-limit deductions — need the second.
 * Waiting for both would make the deck list wait on the heaviest table in the
 * account; waiting for neither would paint "you haven't studied today" a beat
 * before the reviews land and take it back.
 *
 * Neither is the whole answer on its own: a device that is offline never gets a
 * confirmation at all, which is what `use-data-ready.ts` is for.
 */
export function usePreloadComplete(): TPreloadState {
  return useSyncExternalStore(
    subscribe,
    () => preloaded.state,
    () => preloaded.state,
  );
}

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
  preloaded.setState(() => ({ account: false, logs: false }));

  const profiles = zero.preload(queries.learningProfiles(), { ttl: "forever" });
  const decks = zero.preload(queries.decks(), { ttl: "forever" });
  const cards = zero.preload(queries.cards(), { ttl: "forever" });

  void Promise.all([profiles.complete, decks.complete, cards.complete]).then(() => {
    preloaded.setState((s) => ({ ...s, account: true }));
  });

  void cards.complete.then(() => {
    const logs = zero.preload(queries.reviewLogs(), { ttl: "forever" });
    void logs.complete.then(() => {
      preloaded.setState((s) => ({ ...s, logs: true }));
    });
  });
}
