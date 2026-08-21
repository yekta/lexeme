import { useCallback, useEffect, useState } from "react";

import { clearAccountHint } from "@/lib/account-hint";
import {
  clearIdentity,
  saveIdentity,
  useStoredIdentity,
  type TIdentity,
} from "@/lib/identity";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { SIGN_IN_PATHNAME } from "@/lib/constants";

/**
 * How sure we are about the session behind the identity we're using.
 *
 * - `ok`       the server confirmed it this launch
 * - `checking` the probe is still in flight; the remembered identity stands in
 * - `offline`  the probe failed. Not a verdict: a flaky network, a redeploy, a
 *              laptop that just woke up, so the app stays open and syncing
 *              resumes on its own
 * - `expired`  the server answered, and there is no session. Signing in is the
 *              fix, but the local archive stays readable in the meantime
 */
export type TAuthStatus = "ok" | "checking" | "offline" | "expired";

/**
 * Better Auth probes the session once on mount and then leaves `error` set
 * forever. One failed probe is not a verdict, though, and treating it as one
 * strands the app in `offline` until a manual reload: on an app whose whole
 * premise is riding those out. So retry on a backoff, and immediately when the
 * browser says it's back.
 */
function useSessionRecovery(error: unknown, refetch: () => void): void {
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!error) {
      setAttempt(0);
      return;
    }
    // 1s, 2s, 4s … capped at 30s. `attempt` is a dependency so this re-arms
    // even when the error object is identical between tries.
    const timer = setTimeout(
      () => {
        void refetch();
        setAttempt((n) => n + 1);
      },
      Math.min(1_000 * 2 ** attempt, 30_000),
    );
    return () => clearTimeout(timer);
  }, [error, refetch, attempt]);

  useEffect(() => {
    const onOnline = () => {
      setAttempt(0);
      void refetch();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refetch]);
}

/**
 * The identity gate: auth decides whether this device can *sync*, never whether
 * it can be *used*. Once signed in, `user` keeps answering from the remembered
 * identity through an expired session, a dead network or a cold offline launch,
 * so every screen and every write keeps working and Zero queues what it can't
 * send yet.
 */
export function useAuth() {
  const { data: session, isPending, error, refetch } = useSession();
  const stored = useStoredIdentity();

  useSessionRecovery(error, refetch);

  useEffect(() => {
    if (!session?.user) return;
    const identity: TIdentity = {
      id: session.user.id,
      email: session.user.email,
      image: session.user.image ?? null,
    };
    saveIdentity(identity);
  }, [session?.user]);

  let user: TIdentity | null;
  let status: TAuthStatus;
  if (session?.user) {
    user = {
      id: session.user.id,
      email: session.user.email,
      image: session.user.image ?? null,
    };
    status = "ok";
  } else if (isPending) {
    user = stored;
    status = "checking";
  } else if (error || (typeof navigator !== "undefined" && !navigator.onLine)) {
    // Couldn't reach the server. Open from what this device already holds.
    user = stored;
    status = "offline";
  } else {
    // The server answered: no session. Expired, or never signed in here.
    user = stored;
    status = "expired";
  }

  /**
   * Both URLs are absolute on purpose. Better Auth resolves a relative one
   * against its own base URL, which in production is the API host, so `"/"`
   * would land the user on api.lexeme.fyi after the round trip instead of back
   * in the app. The server accepts them because `WEB_ORIGIN` is in its trusted
   * origins; it origin-checks `errorCallbackURL` exactly as it does
   * `callbackURL`.
   */
  const signInWithGoogle = useCallback(async () => {
    await signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/`,
      errorCallbackURL: `${window.location.origin}${SIGN_IN_PATHNAME}`,
    });
  }, []);

  const logout = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          // This device may be shared: drop the remembered identity, the boot
          // hint that says how much data to expect, and the local Zero store,
          // then hard-navigate so in-memory state dies with the page instead of
          // leaking into the next session.
          clearIdentity();
          clearAccountHint();
          void dropLocalStore().then(() => {
            window.location.assign(SIGN_IN_PATHNAME);
          });
        },
      },
    });
  }, []);

  return {
    user,
    /** True only while the very first probe is running with nothing remembered. */
    isPending: status === "checking" && !stored,
    status,
    signInWithGoogle,
    logout,
  };
}

/**
 * Delete Zero's local replica for this origin.
 *
 * Zero keys its IndexedDB databases per user and per schema, so rather than
 * guess at names, drop every database this origin owns. Best-effort: a browser
 * without `databases()` (Firefox) simply keeps the store, which the hard
 * navigation and the next user's separate Zero client already isolate.
 */
async function dropLocalStore(): Promise<void> {
  try {
    const databases = await indexedDB.databases?.();
    if (!databases) return;
    await Promise.all(
      databases
        .map((d) => d.name)
        .filter((name): name is string => Boolean(name))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // Storage unavailable; the navigation below is still the important part.
  }
}
