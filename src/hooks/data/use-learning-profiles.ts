"use client";

import { api } from "@/trpc/react";

export function useLearningProfiles() {
  return api.learningProfiles.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
}

export function useDefaultLearningProfile() {
  const { data: profiles = [], ...rest } = useLearningProfiles();
  return { data: profiles.find((p) => p.is_default) ?? null, ...rest };
}

export function useCreateLearningProfile() {
  const utils = api.useUtils();
  return api.learningProfiles.create.useMutation({
    onSuccess: () => utils.learningProfiles.list.invalidate(),
  });
}

export function useUpdateLearningProfile() {
  const utils = api.useUtils();
  return api.learningProfiles.update.useMutation({
    onSuccess: () => {
      utils.learningProfiles.list.invalidate();
      utils.stats.deckStats.invalidate();
    },
  });
}

export function useDeleteLearningProfile() {
  const utils = api.useUtils();
  return api.learningProfiles.delete.useMutation({
    onSuccess: () => utils.learningProfiles.list.invalidate(),
  });
}
