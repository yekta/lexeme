"use client";

import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import { queries } from "@/zero/queries";
import { zeroStatus } from "@/zero/status";

/** The user's learning profiles — default first, then alphabetical. */
export function useLearningProfiles() {
  const [rows, details] = useQuery(queries.learningProfiles());
  const data = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [rows],
  );
  return { data, ...zeroStatus(data.length > 0, details) };
}

export function useDefaultLearningProfile() {
  const { data, ...rest } = useLearningProfiles();
  return { data: data.find((p) => p.is_default) ?? null, ...rest };
}
