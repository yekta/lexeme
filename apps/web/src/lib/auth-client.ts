import { createAuthClient } from "better-auth/react";

import { API_BASE } from "@/lib/api";

/**
 * In dev the Vite server proxies `/api`, so leaving `baseURL` unset keeps
 * everything same-origin. In production it points at the API host: same-site
 * with the app, so the session cookie still rides along (the client sends
 * `credentials: "include"` by default).
 */
export const authClient = createAuthClient({
  baseURL: API_BASE || undefined,
});

export const { signIn, signOut, useSession } = authClient;
