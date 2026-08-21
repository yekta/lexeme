import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Whether the viewport is below the `md` breakpoint.
 *
 * Answered during the first render rather than from an effect. Nothing in this
 * app is server-rendered, so `matchMedia` is readable before the first paint,
 * and a hook that reports "desktop" for one frame makes its consumer lay the
 * screen out twice on every phone: once wrong, then again once the effect
 * flushes, which the user sees as a jump.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    // The viewport can cross the breakpoint between the first render and this
    // effect, so take a reading here too.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
