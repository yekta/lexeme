import type { ReactNode } from "react";

import useRedirectToSignInIfNecessary from "@/hooks/use-redirect-to-sign-in-if-necessary";

/**
 * Renders a data screen only once this device has an identity to read as.
 *
 * Two jobs, and they are the same job: it is what sends a genuinely signed-out
 * visitor to the sign-in page, and it is what guarantees no `useQuery` runs
 * outside a `ZeroRoot`: the provider only mounts when there is a user, and
 * `useQuery` reaches for the client from context even when disabled.
 *
 * "Has an identity" is deliberately weaker than "has a live session": an
 * offline launch, a slow probe or an expired session all still render the
 * screen, from the local store. Only the server saying there is no session,
 * with nothing remembered on this device, falls through to the redirect.
 */
export function RequireIdentity({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useRedirectToSignInIfNecessary();
  return <>{user ? children : fallback}</>;
}
