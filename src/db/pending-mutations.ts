"use client";

import { Store } from "@tanstack/store";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks the count of in-flight optimistic mutations per collection id.
 *
 * TanStack DB exposes optimistic insert/update state through each row's
 * `$synced` flag, so the existing `isRowOptimistic` check covers those. Deletes
 * are the gap: an optimistically-deleted row is removed from the live state
 * immediately, so there's nothing left to inspect. Delete mutation hooks call
 * `trackPending` to feed that into a sidecar counter the UI can subscribe to.
 */
const counts = new Store<Record<string, number>>({});

export function trackPending(
  collectionId: string,
  tx: { isPersisted: { promise: Promise<unknown> } },
): void {
  counts.setState((s) => ({ ...s, [collectionId]: (s[collectionId] ?? 0) + 1 }));
  void tx.isPersisted.promise.finally(() => {
    counts.setState((s) => ({
      ...s,
      [collectionId]: Math.max(0, (s[collectionId] ?? 0) - 1),
    }));
  });
}

export function usePendingMutations(collectionId: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => counts.subscribe(onChange).unsubscribe,
    [],
  );
  const getSnapshot = useCallback(
    () => (counts.state[collectionId] ?? 0) > 0,
    [collectionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
