import { createContext, useContext, type ReactNode } from "react";

import { useDataReady, type TDataReady } from "@/hooks/use-data-ready";

/**
 * Data readiness, computed once and shared.
 *
 * Every data hook wants the answer, and the computation behind it owns two
 * timers and writes the boot hint, so it runs in one place, inside the Zero
 * provider, rather than once per hook.
 *
 * The default outside the provider is "not ready", which is correct: with no
 * Zero client there is no local store to be ready, and nothing that reads data
 * renders in that state anyway (see `RequireIdentity`).
 */
const NOT_READY: TDataReady = { account: false, logs: false, stalled: false };

const DataReadyContext = createContext<TDataReady>(NOT_READY);

export function AccountProvider({ children }: { children: ReactNode }) {
  const ready = useDataReady();
  return <DataReadyContext value={ready}>{children}</DataReadyContext>;
}

/** True once every screen may draw itself, empty ones included. */
export function useAccountReady(): boolean {
  return useContext(DataReadyContext).account;
}

/**
 * True once the review history is on the device.
 *
 * Separate from `useAccountReady` because review logs are preloaded behind
 * everything else: the deck list should not wait on them, and the figures
 * derived from them (today's counts, retention, the daily-limit deductions)
 * must not be shown before they arrive, or the screen states a number and then
 * corrects itself.
 */
export function useReviewLogsReady(): boolean {
  return useContext(DataReadyContext).logs;
}

/**
 * True when a screen is drawing itself only because sync gave up, on a device
 * that never received the account. Screens use it to say "we could not load
 * this" where they would otherwise say "there is nothing here".
 */
export function useSyncStalled(): boolean {
  return useContext(DataReadyContext).stalled;
}
