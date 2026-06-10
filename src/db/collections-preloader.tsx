"use client";

import { useEffect } from "react";

import { preloadCollections } from "@/db/collections";
import { startOutboxReplay } from "@/db/offline";

/**
 * Starts syncing every TanStack DB collection as soon as the app mounts, so
 * navigating to any page finds its data already loading (or loaded). Also
 * starts the durable outbox, replaying any writes left queued from a previous
 * session (e.g. the tab was closed before they reached the server).
 */
export function CollectionsPreloader() {
  useEffect(() => {
    preloadCollections();
    startOutboxReplay();
  }, []);
  return null;
}
