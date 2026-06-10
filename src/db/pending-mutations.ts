"use client";

import { Store } from "@tanstack/store";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks the count of in-flight mutations per entity ("decks", "cards", …).
 *
 * Convex applies optimistic updates to the local query store instantly and
 * reconciles when the server confirms, but it doesn't expose a per-row "this
 * row is unconfirmed" flag. So the UI's optimistic indicator is driven by this
 * sidecar counter: each mutation increments it while its promise is in flight
 * and decrements when it settles.
 */
const counts = new Store<Record<string, number>>({});

export function trackMutation(entity: string, promise: Promise<unknown>): void {
  counts.setState((s) => ({ ...s, [entity]: (s[entity] ?? 0) + 1 }));
  void promise.finally(() => {
    counts.setState((s) => ({
      ...s,
      [entity]: Math.max(0, (s[entity] ?? 0) - 1),
    }));
  });
}

export function usePendingMutations(entity: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => counts.subscribe(onChange).unsubscribe,
    [],
  );
  const getSnapshot = useCallback(
    () => (counts.state[entity] ?? 0) > 0,
    [entity],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
