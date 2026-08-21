import { useEffect, useState } from "react";

/** Keep in step with `duration-150` below, plus a frame of slack. */
const FADE_MS = 200;

/**
 * The opaque canvas a screen settles behind.
 *
 * The real screen stays mounted underneath, so auth, Zero and layout can reach
 * their final state without painting a placeholder that disappears a frame
 * later. The cover itself never fades in on boot: that would expose the exact
 * half-built frame it exists to hide.
 *
 * It is short-lived by design. `usePlaceholderPhase` lifts it after
 * `SETTLE_BUDGET.skeletonGrace`, at which point the screen's own skeleton takes
 * over. It used to be able to sit there for as long as the wait lasted, with a
 * spinner in the middle once the wait got long, which meant a slow boot showed
 * a bare canvas and a spinner while a perfectly good skeleton sat underneath it.
 */
export function SettleCover({ show, fadeIn = false }: { show: boolean; fadeIn?: boolean }) {
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

  if (!mounted) return null;

  return (
    <div
      data-settle-cover={show ? "up" : "lifting"}
      aria-hidden
      className={`fixed inset-0 z-50 bg-background transition-opacity duration-150 ease-out ${
        opaque ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    />
  );
}
