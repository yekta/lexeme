import { useEffect, useRef, useState } from "react";

/**
 * Timing discipline for everything that arrives asynchronously.
 *
 * One rule: a screen may not show a state it is about to take back. Every
 * transition in this app is caused by an event (data arriving, the connection
 * changing, the session answering), and the numbers below are budgets for when
 * an expected event never arrives, never the mechanism by which the UI decides
 * what is true.
 */
export const SETTLE_BUDGET = {
  /**
   * How long a screen may settle behind an opaque cover before it gives up and
   * shows its skeleton.
   *
   * Short on purpose. Its only job is to absorb the boot that resolves almost
   * immediately, which is most of them once the local store is warm: under this,
   * the screen goes straight from cover to content and no placeholder is ever
   * painted. Past it, waiting silently is worse than saying something, and the
   * thing to say is the skeleton, which already describes the shape of what is
   * coming.
   */
  skeletonGrace: 150,
  /**
   * Once a skeleton is on screen it stays for at least this long. A placeholder
   * that appears and vanishes within a couple of frames is the flash it was
   * meant to prevent.
   */
  skeletonMin: 400,
  /**
   * The backstop for an account this device was told to expect that never
   * arrives. Past this the screens draw themselves from whatever is local,
   * which for a wedged sync is the honest answer and for a healthy one is never
   * reached.
   */
  account: 8_000,
  /** How long a worse sync status must hold before it is worth reporting. */
  statusHold: 800,
  /**
   * How long a connection may stay unestablished before we stop calling it
   * "syncing" and call it what it is. Zero retries forever and never reports a
   * terminal failure, so without a ceiling the UI waits indefinitely on a sync
   * service that is simply down.
   */
  unreachable: 10_000,
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

export type TPlaceholderPhase = {
  /** Draw the screen's placeholder frame. */
  isPlaceholder: boolean;
  /** Hide it behind an opaque cover, because it is not worth showing yet. */
  showCover: boolean;
};

/**
 * The two-stage settle every data screen goes through.
 *
 * The screen is always mounted and always drawing something, so auth, Zero and
 * layout reach their final state without anything half-built being painted.
 * What changes is whether the user sees it:
 *
 *   0..grace     covered. A boot that resolves in this window shows nothing at
 *                all before the real content, which is the common case.
 *   grace..      the skeleton, held for `skeletonMin` once it appears so it
 *                cannot blink.
 *
 * There is deliberately no spinner anywhere in this. A skeleton says what is
 * about to be there; a spinner says only that something is happening, and this
 * app already ships a skeleton for every screen.
 */
export function usePlaceholderPhase(pending: boolean): TPlaceholderPhase {
  const graceSpent = useHeld(pending, SETTLE_BUDGET.skeletonGrace);
  const skeleton = usePatient(pending && graceSpent, SETTLE_BUDGET.skeletonMin);
  return {
    // `skeleton` outlives `pending` by up to `skeletonMin`, and the frame has to
    // stay drawn for that whole time or the hold does nothing.
    isPlaceholder: pending || skeleton,
    showCover: pending && !skeleton,
  };
}
