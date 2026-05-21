import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { signIn, signOut, useSession } from "@/lib/auth-client";
import { setCurrentUserId } from "@/lib/session-store";

/**
 * Better Auth session, plus Google sign-in / sign-out helpers. Keeps the
 * synchronous user-id cache (used to build optimistic write rows) up to date.
 */
export function useAuth() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    setCurrentUserId(userId);
  }, [userId]);

  const signInWithGoogle = useCallback(async () => {
    await signIn.social({ provider: "google", callbackURL: "/" });
  }, []);

  const logout = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => navigate({ to: "/sign-in" }),
      },
    });
  }, [navigate]);

  return {
    user: session?.user ?? null,
    isPending,
    signInWithGoogle,
    logout,
  };
}
