import type { ZeroOptions } from "@rocicorp/zero";

import { mutators, schema, type TAuthData, type TSchema } from "@lexeme/contracts";

/**
 * Everything needed to construct a Zero client, in one place.
 *
 * A factory rather than an inline `new Zero(...)` because the per-shell
 * differences are exactly these four values, and this is the seam an Electron
 * or iOS build plugs into rather than a second copy of the wiring:
 *
 *   web      auth undefined (zero-cache forwards the session cookie),
 *            kvStore "idb"
 *   Electron same as web when it loads the app over https; otherwise `auth`
 *   iOS      auth = the stored session cookie, and its own SQLite kvStore
 */
export type TLexemeZeroConfig = {
  /** zero-cache URL, e.g. https://zero.lexeme.fyi */
  cacheURL: string;
  userID: string;
  /**
   * Auth token forwarded by zero-cache to `/api/zero/query|mutate` as an
   * `Authorization: Bearer` header. Undefined on web, where the Better Auth
   * session cookie is forwarded instead (ZERO_*_FORWARD_COOKIES). Native shells
   * with no cookie jar pass their stored session cookie here; `getAuthData` on
   * the server accepts either.
   */
  auth?: string | undefined;
  kvStore: "idb" | "mem";
};

/** The zero-cache this build talks to. */
export const ZERO_CACHE_URL: string =
  import.meta.env.VITE_ZERO_CACHE_URL ?? "http://localhost:4848";

export function lexemeZeroOptions(config: TLexemeZeroConfig) {
  // The client mirrors the context for its optimistic runs. The server does not
  // trust it: `/api/zero/*` derives its own from the verified session.
  const context: TAuthData = { user_id: config.userID };
  return {
    schema,
    mutators,
    context,
    userID: config.userID,
    auth: config.auth,
    cacheURL: config.cacheURL,
    kvStore: config.kvStore,
    // Zero learns a connection is dead only by missing a pong, and budgets
    // 2 x this for the verdict. The 5s default therefore spends ten seconds
    // telling someone who just walked out of wifi range that they are synced,
    // because a link that goes quiet without closing the socket (a captive
    // portal, a phone leaving the building) gives off no other signal at all.
    // Six seconds is the trade: short enough to notice, long enough that a slow
    // mobile round trip is not read as a death and made to reconnect for
    // nothing. The socket usually closes outright, in which case none of this
    // is on the path and the banner is up in about a second.
    pingTimeoutMs: 3_000,
  } satisfies ZeroOptions<TSchema>;
}
