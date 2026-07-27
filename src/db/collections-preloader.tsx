"use client";

import { useEffect } from "react";

import { preloadCollections } from "@/db/collections";
import { startOutbox } from "@/db/offline";
import { startCollectionRefresh } from "@/db/refresh";

/**
 * Starts syncing every TanStack DB collection as soon as the app mounts —
 * persisted rows render immediately while the initial refetch runs. Also
 * starts the durable outbox, which replays any writes left queued from a
 * previous session, and the freshness triggers (focus/online/cross-tab).
 */
export function CollectionsPreloader() {
  useEffect(() => {
    preloadCollections();
    startOutbox();
    startCollectionRefresh();
  }, []);
  return null;
}
