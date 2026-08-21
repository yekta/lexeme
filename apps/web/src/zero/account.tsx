import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useDataReady, type TDataReady } from "@/hooks/use-data-ready";
import { useSyncStatus, type TSyncStatus } from "@/lib/sync-status";

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
type TAccountState = TDataReady & { sync: TSyncStatus | null };

const NOT_READY: TAccountState = {
  account: false,
  logs: false,
  stalled: false,
  sync: null,
};

const DataReadyContext = createContext<TAccountState>(NOT_READY);

/**
 * One sync verdict for the whole app.
 *
 * The banner and the readiness logic used to work it out separately, from
 * different inputs: the banner passed the real session status and readiness
 * passed a hardcoded `false`. So the two could hold different opinions at the
 * same time, and each ran its own hysteresis timer, which meant they could also
 * change their minds at different moments. Computed once here, they cannot
 * disagree.
 */
export function AccountProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const sync = useSyncStatus(status === "expired");
  const ready = useDataReady(sync);
  // Depends on the fields, not on `ready` itself: `useDataReady` hands back a
  // fresh object every render, so memoising on it would memoise nothing.
  const value = useMemo(
    () => ({ account: ready.account, logs: ready.logs, stalled: ready.stalled, sync }),
    [ready.account, ready.logs, ready.stalled, sync],
  );
  return <DataReadyContext value={value}>{children}</DataReadyContext>;
}

/** The one sync verdict, already settled. */
export function useSync(): TSyncStatus | null {
  return useContext(DataReadyContext).sync;
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
