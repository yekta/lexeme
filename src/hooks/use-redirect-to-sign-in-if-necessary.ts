import { useAuth } from "@/hooks/use-auth";
import { SIGN_IN_PATHNAME } from "@/lib/constants";
import { useRouter } from "nextjs-toploader/app";
import { useEffect } from "react";

export default function useRedirectToSignInIfNecessary() {
  const { isPending, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isPending) return;
    if (user) return;
    router.push(SIGN_IN_PATHNAME);
  }, [isPending, user]);

  return { isPending, user };
}
