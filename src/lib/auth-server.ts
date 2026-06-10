import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

import { env } from "@/env";

/**
 * Server-only Better Auth helpers for TanStack Start: `handler` proxies the
 * `/api/auth/*` routes to the Convex deployment, and `getToken` reads the
 * current session token from the request cookies (used in the root
 * `beforeLoad` to authenticate SSR Convex queries).
 */
export const { handler, getToken, fetchAuthQuery, fetchAuthMutation } =
  convexBetterAuthReactStart({
    convexUrl: env.VITE_CONVEX_URL,
    convexSiteUrl: env.VITE_CONVEX_SITE_URL,
    basePath: "/api/auth",
  });
