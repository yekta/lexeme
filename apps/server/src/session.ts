import type { TAuthData } from "@lexeme/contracts";

import { auth } from "./auth.ts";

/**
 * Resolve the authenticated user for an incoming request.
 *
 * Deliberately transport-agnostic. zero-cache attaches whichever credential the
 * connecting client gave it, and it can attach either:
 *
 *   if (ctx.auth?.raw)        headers["Authorization"] = `Bearer ${...}`
 *   if (headerOptions.cookie) headers["Cookie"]        = ...
 *
 * The web app takes the cookie path (ZERO_*_FORWARD_COOKIES, which needs the
 * session cookie issued for `.lexeme.fyi` so it is visible on
 * zero.lexeme.fyi). A future Electron or iOS shell has no browser cookie jar
 * and instead passes its stored session cookie as the Zero client's `auth`
 * option, which arrives here as a bearer token. Translating it back into a
 * Cookie header means both shells authenticate through one code path, and the
 * native ones need no change on this side when they land.
 */
export async function getAuthData(req: Request): Promise<TAuthData | undefined> {
  const headers = new Headers(req.headers);
  const bearer = headers.get("authorization");
  if (bearer?.startsWith("Bearer ") && !headers.get("cookie")) {
    headers.set("cookie", bearer.slice("Bearer ".length));
  }
  const session = await auth.api.getSession({ headers });
  return session ? { user_id: session.user.id } : undefined;
}
