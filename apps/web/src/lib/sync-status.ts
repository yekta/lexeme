import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { SETTLE_BUDGET, useHeld } from "@/lib/settle";

/**
 * One derived answer to "how is syncing going?".
 *
 * Several places want to know: the offline banner, and anything that would
 * otherwise sit waiting for rows that are never coming, and each interpreting
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
  /**
   * The browser has a network but the sync service never answers. Distinct from
   * `offline` because the cause is ours, not theirs, and the wording has to
   * differ: telling someone with working wifi that they are offline sends them
   * to reboot their router.
   */
  | { name: "unreachable" }
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
  return (
    status?.name === "offline" ||
    status?.name === "unreachable" ||
    status?.name === "refused" ||
    status?.name === "expired"
  );
}

/** True when sync is working or still plausibly about to. */
export function isSyncHealthy(status: TSyncStatus | null): boolean {
  return status === null || status.name === "synced" || status.name === "syncing";
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

/** By value, not identity: `refused` carries a string and every render rebuilds it. */
function statusKey(status: TSyncStatus): string {
  return status.name === "refused" ? `refused:${status.detail}` : status.name;
}

export function useSyncStatus(sessionExpired: boolean): TSyncStatus | null {
  const conn = useConnectionState();
  const online = useOnline();

  // Zero retries a failed connection forever, and reports each attempt as
  // `connecting` rather than as a failure, so a sync service that accepts the
  // TCP connection and then never speaks looks, to this hook, exactly like one
  // that is about to answer. Left alone it says "syncing" for the rest of the
  // session and the UI waits on data that is never coming. Past this, a
  // connection that has not established is a connection that is not going to.
  const stuckConnecting = useHeld(online && conn.name !== "connected", SETTLE_BUDGET.unreachable);

  let current: TSyncStatus;
  if (sessionExpired) current = { name: "expired" };
  else if (conn.name === "needs-auth")
    current = { name: "refused", detail: describeRejection(conn.reason) };
  else if (!online || conn.name === "disconnected" || conn.name === "error")
    current = { name: "offline" };
  else if (conn.name === "connected") current = { name: "synced" };
  else if (stuckConnecting) current = { name: "unreachable" };
  else current = { name: "syncing" };

  // `navigator.onLine` going false is not a guess we should sit on for a beat:
  // the browser is stating a fact, and the user who just turned off their wifi
  // is watching for the app to notice.
  return useSettledStatus(current, !online);
}

/**
 * Reports `synced` immediately, anything the browser states as fact
 * immediately, and every other verdict once it has held for
 * `SETTLE_BUDGET.statusHold`. Before the first verdict, reports nothing.
 *
 * The hold is measured from the moment the truth stopped matching what is on
 * screen, not from the last time the truth changed. That distinction is the
 * whole point: Zero cycles `connecting` and `disconnected` several times a
 * second while it retries, and a timer restarted on every one of those never
 * fires. The banner then freezes on whatever it last managed to report, which
 * is how turning off wifi left it insisting the sync service was unreachable.
 */
function useSettledStatus(current: TSyncStatus, immediate: boolean): TSyncStatus | null {
  const [reported, setReported] = useState<TSyncStatus | null>(
    current.name === "synced" ? current : null,
  );
  const latest = useRef(current);
  latest.current = current;
  /** When `current` first disagreed with `reported`. Survives key changes. */
  const disagreedAt = useRef<number | null>(null);

  const key = statusKey(current);
  const reportedKey = reported ? statusKey(reported) : null;
  const settleNow = immediate || current.name === "synced";

  useEffect(() => {
    if (key === reportedKey) {
      disagreedAt.current = null;
      return;
    }
    if (settleNow) {
      disagreedAt.current = null;
      setReported(latest.current);
      return;
    }
    disagreedAt.current ??= Date.now();
    const wait = Math.max(0, disagreedAt.current + SETTLE_BUDGET.statusHold - Date.now());
    const timer = setTimeout(() => {
      disagreedAt.current = null;
      setReported(latest.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [key, reportedKey, settleNow]);

  return reported;
}
