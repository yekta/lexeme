"use client";

import { useSyncExternalStore } from "react";

/** Last thing calibration did for a profile this session. Calibration runs in a
 * worker, not the outbox, so it isn't visible to TanStack DB's `$synced`. */
export type TCalibrationState = "idle" | "running" | "insufficient-data";

const states = new Map<string, TCalibrationState>();
const listeners = new Set<() => void>();

export function setCalibrationState(
  profileId: string,
  state: TCalibrationState,
): void {
  if ((states.get(profileId) ?? "idle") === state) return;
  if (state === "idle") states.delete(profileId);
  else states.set(profileId, state);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCalibrationState(
  profileId: string | undefined,
): TCalibrationState {
  return useSyncExternalStore(
    subscribe,
    () => (profileId ? (states.get(profileId) ?? "idle") : "idle"),
    () => "idle" as const,
  );
}

export function useIsCalibrating(profileId: string | undefined): boolean {
  return useCalibrationState(profileId) === "running";
}
