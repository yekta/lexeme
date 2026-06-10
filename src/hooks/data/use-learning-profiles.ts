"use client";

import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/convex-api";

/** The user's learning profiles — default first, then alphabetical (backend). */
export function useLearningProfiles() {
  const { data, isPending, isError, error, refetch } = useQuery(
    convexQuery(api.learningProfiles.list, {}),
  );
  return { data: data ?? [], isPending, isError, error, refetch };
}

export function useDefaultLearningProfile() {
  const { data, ...rest } = useLearningProfiles();
  return { data: data.find((p) => p.is_default) ?? null, ...rest };
}
