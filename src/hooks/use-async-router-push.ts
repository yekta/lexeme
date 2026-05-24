import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

/**
 * Navigate to `path` and resolve once the router has committed. TanStack
 * Router's `navigate()` returns a Promise that resolves on commit, so this is
 * just a thin wrapper that also exposes an `isPending` flag for callers that
 * want to disable buttons during the transition.
 */
export const useAsyncRouterPush = () => {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const asyncPush = async (path: string) => {
    setIsPending(true);
    try {
      await router.navigate({ to: path });
    } finally {
      setIsPending(false);
    }
  };

  return [asyncPush, isPending] as const;
};
