import { useZero, ZeroProvider } from "@rocicorp/zero/react";
import { useEffect, useMemo, type ReactNode } from "react";

import { SyncBanner } from "@/components/sync-banner";
import { useAuth } from "@/hooks/use-auth";
import { lexemeZeroOptions, ZERO_CACHE_URL } from "@/zero/options";
import { AccountProvider } from "@/zero/account";
import { startAutoCalibration } from "@/zero/auto-calibration";
import { preloadAccount } from "@/zero/preload";

/**
 * Mounts the Zero client for whoever this device is signed in as.
 *
 * Keyed on the user id so switching accounts builds a fresh client over a fresh
 * local store rather than rebasing one user's pending writes onto another's
 * data. `init` is `preloadAccount` at module scope, never an inline closure:
 * every prop here is a dependency of the effect that constructs Zero, and that
 * effect's cleanup closes it, so an unstable prop rebuilds the client on every
 * render.
 *
 * With no identity there is no client, and children render without one. Nothing
 * that reads data renders in that state: see `RequireIdentity`, which every
 * data route goes through, because `useQuery` reaches for the client from
 * context even when its query is disabled. The sync banner is inside the
 * provider for the same reason: it reads the connection.
 */
export function ZeroRoot({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <>{children}</>;
  return (
    <ZeroClient key={user.id} userID={user.id}>
      {children}
    </ZeroClient>
  );
}

function ZeroClient({ userID, children }: { userID: string; children: ReactNode }) {
  const options = useMemo(
    () =>
      lexemeZeroOptions({
        cacheURL: ZERO_CACHE_URL,
        userID,
        // Web: no token. zero-cache forwards the Better Auth session cookie
        // instead, which is why it has to be issued for the parent domain
        // (COOKIE_DOMAIN). A native shell would pass its stored cookie here.
        kvStore: "idb",
      }),
    [userID],
  );

  return (
    <ZeroProvider {...options} init={preloadAccount}>
      <AutoCalibration />
      <AccountProvider>
        <SyncBanner />
        {children}
      </AccountProvider>
    </ZeroProvider>
  );
}

/**
 * Kicks off the FSRS optimizer once per load, from inside the provider so it
 * has a client to read the account with. It defers itself to idle; nothing
 * renders behind it.
 */
function AutoCalibration() {
  const zero = useZero();
  useEffect(() => {
    void startAutoCalibration(zero);
    if (import.meta.env.DEV) {
      // Dev escape hatch: run a pass now, ignoring the gates.
      (window as unknown as { calibrateNow: () => Promise<void> }).calibrateNow = () =>
        startAutoCalibration(zero, { force: true });
    }
  }, [zero]);
  return null;
}
