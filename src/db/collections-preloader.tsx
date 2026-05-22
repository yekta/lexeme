"use client";

import { useEffect } from "react";

import { preloadCollections } from "@/db/collections";

/**
 * Starts syncing every TanStack DB collection as soon as the app mounts, so
 * navigating to any page finds its data already loading (or loaded).
 */
export function CollectionsPreloader() {
  useEffect(() => {
    preloadCollections();
  }, []);
  return null;
}
