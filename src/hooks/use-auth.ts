import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

export function useAuth() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const signInWithGoogle = useCallback(async () => {
    await signIn.social({ provider: "google", callbackURL: "/" });
  }, []);

  const logout = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => router.navigate({ to: "/sign-in" }),
      },
    });
  }, [router]);

  return {
    user: session?.user ?? null,
    isPending,
    signInWithGoogle,
    logout,
  };
}
