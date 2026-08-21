import { useAuth } from "@/hooks/use-auth";
import { SIGN_IN_PATHNAME } from "@/lib/constants";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Send someone to sign in only when there is genuinely nothing else to show.
 *
 * That means both: the server actually answered that there is no session, and
 * this device has no remembered identity. A slow probe, a dead network or an
 * expired session all keep the app open on the local store instead: bouncing
 * an offline device to a sign-in screen it cannot complete is the one outcome
 * a local-first build has no excuse for.
 */
export default function useRedirectToSignInIfNecessary() {
  const { isPending, user, status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "expired" || user) return;
    router.navigate({ to: SIGN_IN_PATHNAME });
  }, [status, user, router]);

  return { isPending, user };
}
