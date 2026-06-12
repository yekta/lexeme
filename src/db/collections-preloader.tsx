"use client";

import { useEffect } from "react";

import { preloadCollections } from "@/db/collections";
import { startOutbox } from "@/db/offline";

/**
 * Starts syncing every TanStack DB collection as soon as the app mounts —
 * persisted rows render immediately while the Electric shape streams resume
 * from their stored offsets. Also starts the durable outbox, which replays
 * any writes left queued from a previous session (e.g. the tab was closed
 * before they reached the server).
 */
export function CollectionsPreloader() {
  useEffect(() => {
    preloadCollections();
    startOutbox();
  }, []);
  return null;
}
