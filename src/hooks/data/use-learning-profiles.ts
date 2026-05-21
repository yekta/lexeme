import { useMemo } from "react";
import { getCollections } from "@/lib/collections";
import type { TLearningProfileRow } from "@/lib/db-types";
import {
  FSRS_DEFAULT_ENABLE_FUZZ,
  FSRS_DEFAULT_ENABLE_SHORT_TERM,
  FSRS_DEFAULT_LEARNING_STEPS,
  FSRS_DEFAULT_MAXIMUM_INTERVAL,
  FSRS_DEFAULT_RELEARNING_STEPS,
  FSRS_DEFAULT_REQUEST_RETENTION,
  FSRS_DEFAULT_W,
} from "@/lib/fsrs";
import {
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_NEW_CARDS_PER_DAY,
} from "@/lib/constants";
import { getCurrentUserId } from "@/lib/session-store";
import { asMutation } from "./_mutation";
import { useAllLearningProfiles } from "./_collections";

export type TLearningProfile = TLearningProfileRow;

export function useLearningProfiles() {
  const { rows, isLoading } = useAllLearningProfiles();
  const data = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [rows],
  );
  return { data, isPending: isLoading };
}

export function useDefaultLearningProfile() {
  const { data, isPending } = useLearningProfiles();
  return { data: data.find((p) => p.is_default) ?? null, isPending };
}

export function useCreateLearningProfile() {
  return asMutation<{ name: string }, string>((input) => {
    const now = new Date().toISOString();
    const row: TLearningProfileRow = {
      id: crypto.randomUUID(),
      user_id: getCurrentUserId(),
      name: input.name,
      is_default: false,
      new_cards_per_day: DEFAULT_NEW_CARDS_PER_DAY,
      max_reviews_per_day: DEFAULT_MAX_REVIEWS_PER_DAY,
      request_retention: FSRS_DEFAULT_REQUEST_RETENTION,
      maximum_interval: FSRS_DEFAULT_MAXIMUM_INTERVAL,
      w: [...FSRS_DEFAULT_W],
      enable_fuzz: FSRS_DEFAULT_ENABLE_FUZZ,
      enable_short_term: FSRS_DEFAULT_ENABLE_SHORT_TERM,
      learning_steps: [...FSRS_DEFAULT_LEARNING_STEPS] as string[],
      relearning_steps: [...FSRS_DEFAULT_RELEARNING_STEPS] as string[],
      last_calibrated_at: now,
      created_at: now,
      updated_at: now,
    };
    getCollections().learningProfiles.insert(row);
    return row.id;
  });
}

type UpdateLearningProfileInput = Partial<
  Omit<TLearningProfileRow, "id" | "user_id" | "created_at" | "updated_at">
> & { id: string };

export function useUpdateLearningProfile() {
  return asMutation<UpdateLearningProfileInput, void>((input) => {
    const { id, ...fields } = input;
    getCollections().learningProfiles.update(id, (draft) => {
      Object.assign(draft, fields);
      draft.updated_at = new Date().toISOString();
    });
  });
}

export function useDeleteLearningProfile() {
  return asMutation<{ id: string }, void>((input) => {
    getCollections().learningProfiles.delete(input.id);
  });
}
