import type { ReactNode } from "react";

import { SettleCover } from "@/components/settle-cover";
import { usePlaceholderPhase } from "@/lib/settle";

/**
 * A screen's skeleton, under the same settle rule as the screen itself.
 *
 * Used where a route cannot mount its real component yet, which in this app
 * means only one thing: this device has no identity to read as, so `ZeroRoot`
 * has not built a client and `RequireIdentity` is holding the screen back.
 *
 * That wait is almost always a single frame, because the identity is read
 * straight from localStorage. Rendering the skeleton flat would therefore flash
 * it on every navigation for no reason, which is exactly what these three routes
 * used to do. Here it stays covered for the grace window and only appears if the
 * wait turns out to be real.
 */
export function SettlingSkeleton({ children }: { children: ReactNode }) {
  const { showCover } = usePlaceholderPhase(true);
  return (
    <>
      {children}
      <SettleCover show={showCover} />
    </>
  );
}
