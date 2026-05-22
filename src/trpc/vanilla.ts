import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "@/server/api/root";

export function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * A plain tRPC client for use outside of React — the TanStack DB collections
 * call this from their `queryFn` and mutation handlers. Same transport and
 * transformer as the React client in `react.tsx`; the auth cookie rides along
 * automatically because requests are same-origin.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      transformer: superjson,
      url: getBaseUrl() + "/api/trpc",
      headers: () => {
        const headers = new Headers();
        headers.set("x-trpc-source", "tanstack-db");
        return headers;
      },
    }),
  ],
});
