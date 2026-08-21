import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SETTLE_BUDGET } from "@/lib/settle";

/**
 * One derived answer to "how is syncing going?".
 *
 * Several places want to know — the offline banner, and anything that would
 * otherwise sit waiting for rows that are never coming — and each interpreting
 * `useConnectionState()` its own way is how a two-hundred-millisecond blip
 * between reconnects ends up shoving the whole page down by a banner's height.
 *
 * The hysteresis rule is asymmetric on purpose: **bad news waits, good news is
 * instant.** A `disconnected` that lasts a moment between reconnects is not an
 * outage and must never reach the screen; being back is worth showing the
 * instant it happens. `null` means "no verdict worth showing yet", which is
 * what keeps the first paint from claiming anything at all.
 */

/** Zero reports precisely who refused us and with what; pass it on verbatim. */
type TAuthRejection = Extract<
  ReturnType<typeof useConnectionState>,
  { name: "needs-auth" }
>["reason"];

export type TSyncStatus =
  | { name: "synced" }
  | { name: "syncing" }
  /** No usable connection. Everything still works; writes queue. */
  | { name: "offline" }
  /** Signed in, and sync was still turned away: the server's problem, not the user's. */
  | { name: "refused"; detail: string }
  /** The server says this session is gone. Signing in is the fix. */
  | { name: "expired" };

function describeRejection(reason: TAuthRejection): string {
  return reason.type === "zero-cache"
    ? `the sync service reported: ${reason.reason}`
    : `its ${reason.type} endpoint answered ${reason.status}`;
}

/** Nothing more is coming until something changes, so waiting on sync is pointless. */
export function isSyncPaused(status: TSyncStatus | null): boolean {
  return status?.name === "offline" || status?.name === "refused" || status?.name === "expired";
}

function subscribeToOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the browser believes it has a network. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useSyncStatus(sessionExpired: boolean): TSyncStatus | null {
  const conn = useConnectionState();
  const online = useOnline();

  let current: TSyncStatus;
  if (sessionExpired) current = { name: "expired" };
  else if (conn.name === "needs-auth")
    current = { name: "refused", detail: describeRejection(conn.reason) };
  else if (!online || conn.name === "disconnected" || conn.name === "error")
    current = { name: "offline" };
  else if (conn.name === "connected") current = { name: "synced" };
  else current = { name: "syncing" };

  return useSettledStatus(current);
}

/**
 * Reports `synced` immediately and everything else only once it has held for
 * `SETTLE_BUDGET.statusHold`. Before the first verdict, reports nothing at all.
 */
function useSettledStatus(current: TSyncStatus): TSyncStatus | null {
  const [reported, setReported] = useState<TSyncStatus | null>(
    current.name === "synced" ? current : null,
  );
  // Compared by value, not identity: `refused` carries a string, and every
  // render hands back a fresh object for the same state.
  const key = current.name === "refused" ? `refused:${current.detail}` : current.name;
  const latest = useRef(current);
  latest.current = current;

  useEffect(() => {
    if (latest.current.name === "synced") {
      setReported(latest.current);
      return;
    }
    const timer = setTimeout(() => setReported(latest.current), SETTLE_BUDGET.statusHold);
    return () => clearTimeout(timer);
  }, [key]);

  return reported;
}
