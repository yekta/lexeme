"use client";

import { useEffect, useState } from "react";

export const SETTLE_BUDGET = {
  /** Fast boots stay silent; a real wait gets one stable progress indicator. */
  bootLoader: 350,
} as const;

/** True once `active` has held continuously for `ms`. */
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
