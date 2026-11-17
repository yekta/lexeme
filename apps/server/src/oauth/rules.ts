import { createHash, timingSafeEqual } from "node:crypto";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** Desktop apps that register a private-use scheme instead of a loopback port. */
const ALLOWED_APP_SCHEMES = new Set(["cursor:"]);

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function isLoopbackHttp(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

export function isAllowedRedirectUri(value: string): boolean {
  const url = parseUrl(value);
  if (!url) return false;
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  if (isLoopbackHttp(url)) return true;
  return ALLOWED_APP_SCHEMES.has(url.protocol);
}

/** Exact match, except loopback redirects may use any port (RFC 8252 §7.3). */
export function redirectUriMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;

  const target = parseUrl(requested);
  if (!target || !isLoopbackHttp(target)) return false;

  return registered.some((candidate) => {
    const url = parseUrl(candidate);
    if (!url || !isLoopbackHttp(url)) return false;
    return (
      url.hostname === target.hostname &&
      url.pathname === target.pathname &&
      url.search === target.search
    );
  });
}

const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!PKCE_VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const actual = Buffer.from(challenge);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Clients disagree on a trailing slash, so `…/mcp` and `…/mcp/` are one resource. */
export function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}
