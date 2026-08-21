"use client";

import { LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { SETTLE_BUDGET, useHeld } from "@/lib/settle";

/** Keep in step with `duration-150` below, plus a frame of slack. */
const FADE_MS = 200;

/**
 * The opaque canvas a screen settles behind.
 *
 * The real screen stays mounted underneath, so auth, Zero and layout can reach
 * their final state without painting a placeholder that disappears a frame
 * later. The cover itself never fades in on boot: that would expose the exact
 * half-built frame it exists to hide.
 */
export function SettleCover({
  show,
  loader = false,
  fadeIn = false,
}: {
  show: boolean;
  loader?: boolean;
  fadeIn?: boolean;
}) {
  const [mounted, setMounted] = useState(show);
  const [opaque, setOpaque] = useState(show && !fadeIn);

  useEffect(() => {
    if (show) {
      setMounted(true);
      if (fadeIn) {
        const frame = requestAnimationFrame(() => setOpaque(true));
        return () => cancelAnimationFrame(frame);
      }
      setOpaque(true);
      return;
    }

    setOpaque(false);
    const timer = setTimeout(() => setMounted(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [show, fadeIn]);

  const slow = useHeld(show && loader, SETTLE_BUDGET.bootLoader);

  if (!mounted) return null;

  return (
    <div
      data-settle-cover={show ? "up" : "lifting"}
      aria-hidden
      className={`fixed inset-0 z-50 flex items-center justify-center bg-background transition-opacity duration-150 ease-out ${
        opaque ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {slow && (
        <LoaderIcon className="size-6 animate-spin text-muted-foreground [animation-duration:2s]" />
      )}
    </div>
  );
}
