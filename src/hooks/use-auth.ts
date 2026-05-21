"use client";

import { signIn, signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "nextjs-toploader/app";
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
        onSuccess: () => router.push("/sign-in"),
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
