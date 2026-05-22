"use client";

import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";

import { learningProfilesCollection, liveStatus } from "@/db/collections";

/** The user's learning profiles — default first, then alphabetical. */
export function useLearningProfiles() {
  const lq = useLiveQuery((q) => q.from({ profile: learningProfilesCollection }));
  const data = useMemo(
    () =>
      [...(lq.data ?? [])].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [lq.data],
  );
  return { data, ...liveStatus(lq, learningProfilesCollection) };
}

export function useDefaultLearningProfile() {
  const { data, ...rest } = useLearningProfiles();
  return { data: data.find((p) => p.is_default) ?? null, ...rest };
}
