import { useCallback } from "react";

import { clearOutbox } from "@/db/offline";
import { wipeLocalPersistence } from "@/db/persistence";
import { signIn, signOut, useSession } from "@/lib/auth-client";

export function useAuth() {
  const { data: session, isPending } = useSession();

  const signInWithGoogle = useCallback(async () => {
    await signIn.social({ provider: "google", callbackURL: "/" });
  }, []);

  const logout = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          // This device may be shared: drop the local replica (OPFS SQLite)
          // and any queued writes, then hard-navigate so in-memory collection
          // state dies with the page instead of leaking into the next session.
          void Promise.allSettled([wipeLocalPersistence(), clearOutbox()]).then(
            () => {
              window.location.assign("/sign-in");
            },
          );
        },
      },
    });
  }, []);

  return {
    user: session?.user ?? null,
    isPending,
    signInWithGoogle,
    logout,
  };
}
