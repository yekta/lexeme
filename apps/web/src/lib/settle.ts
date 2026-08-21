import { useEffect, useRef, useState } from "react";

/**
 * Timing discipline for everything that arrives asynchronously.
 *
 * One rule: a screen may not show a state it is about to take back. Every
 * transition in this app is caused by an event — data arriving, the connection
 * changing, the session answering — and the numbers below are budgets for when
 * an expected event never arrives, never the mechanism by which the UI decides
 * what is true.
 */
export const SETTLE_BUDGET = {
  /** Fast boots stay silent; a real wait gets one stable progress indicator. */
  bootLoader: 350,
  /**
   * A loader that does appear stays long enough to be read rather than blink.
   */
  loaderMin: 400,
  /**
   * The backstop for an account this device was told to expect that never
   * arrives. Past this the screens draw themselves from whatever is local,
   * which for a wedged sync is the honest answer and for a healthy one is never
   * reached.
   */
  account: 8_000,
  /** How long a worse sync status must hold before it is worth reporting. */
  statusHold: 800,
} as const;

/** True once `active` has held continuously for `ms`. Good news can be instant; bad news waits. */
export function useHeld(active: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (!active) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return held;
}

/**
 * `active`, but once true it stays true for at least `ms`. A loader that
 * appears for a single frame is worse than no loader at all.
 */
export function usePatient(active: boolean, ms: number): boolean {
  const [patient, setPatient] = useState(active);
  const since = useRef(0);

  useEffect(() => {
    if (active) {
      since.current = Date.now();
      setPatient(true);
      return;
    }
    const remaining = since.current + ms - Date.now();
    if (remaining <= 0) {
      setPatient(false);
      return;
    }
    const timer = setTimeout(() => setPatient(false), remaining);
    return () => clearTimeout(timer);
  }, [active, ms]);

  return patient;
}

/** True once `value` has been true at least once, and true from then on. */
export function useLatch(value: boolean): boolean {
  const [latched, setLatched] = useState(value);
  if (value && !latched) setLatched(true);
  return latched;
}
