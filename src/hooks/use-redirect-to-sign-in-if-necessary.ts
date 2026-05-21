import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

/**
 * Client-side auth guard. The real security boundary lives on the server
 * (shape proxy + server functions); this only handles the UX redirect.
 */
export default function useRedirectToSignInIfNecessary() {
  const { isPending, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending || user) return;
    navigate({ to: "/sign-in" });
  }, [isPending, user, navigate]);

  return { isPending, user };
}
