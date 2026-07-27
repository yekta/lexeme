"use client";

import { allCollections, refetchCollections } from "@/db/collections";

/**
 * Freshness triggers for the query collections. Electric pushed changes over
 * a stream; without it, staleness is bounded by explicit refetches instead:
 *
 * - after every outbox write (offline.ts awaits the refetch, then pings here)
 * - a BroadcastChannel ping from another tab of this device
 * - the window regaining focus/visibility (catches other-device changes)
 * - the browser coming back online
 */

const REFETCH_CHANNEL_NAME = "lexeme:collections-refetch";
const THROTTLE_MS = 3_000;

let channel: BroadcastChannel | undefined;
let lastRefetchAt = 0;

function refetchAllThrottled(): void {
  const now = Date.now();
  if (now - lastRefetchAt < THROTTLE_MS) return;
  lastRefetchAt = now;
  void refetchCollections(allCollections);
}

/** Tell other tabs of this device to pull the write we just confirmed. */
export function pingOtherTabs(): void {
  try {
    channel?.postMessage("refetch");
  } catch {
    // Channel closed or unavailable — the focus trigger covers it.
  }
}

/** Install the listeners once per tab (called from CollectionsPreloader). */
export function startCollectionRefresh(): void {
  if (typeof window === "undefined" || channel) return;
  try {
    channel = new BroadcastChannel(REFETCH_CHANNEL_NAME);
    channel.onmessage = () => refetchAllThrottled();
  } catch {
    // No BroadcastChannel — cross-tab freshness degrades to focus refetch.
  }
  window.addEventListener("focus", refetchAllThrottled);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refetchAllThrottled();
  });
  window.addEventListener("online", refetchAllThrottled);
}
