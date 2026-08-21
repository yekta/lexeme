import { Hono } from "hono";

/**
 * The Google avatar, re-served from here.
 *
 * The app is cross-origin isolated (`require-corp`) so the FSRS optimizer can
 * use SharedArrayBuffer, and under that policy a subresource with no CORP
 * header is dropped — which is every image on `googleusercontent.com`. So it
 * comes through this endpoint, which does carry one.
 *
 * Note `cross-origin`, not `same-origin`: this used to run on the same origin
 * as the page and no longer does. `same-origin` here means "only a page on
 * api.lexeme.fyi may embed this", which is nobody, and the avatar would be
 * blocked by the very header meant to permit it.
 *
 * Restricted to Google's own host: an open fetcher on an authenticated origin
 * is an SSRF hole, and it is the only host this app shows images from.
 */
const ALLOWED_HOST_SUFFIX = ".googleusercontent.com";
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function isAllowed(target: URL) {
  return target.protocol === "https:" && target.hostname.endsWith(ALLOWED_HOST_SUFFIX);
}

export const avatarRoutes = new Hono().get("/", async (c) => {
  const raw = c.req.query("url");
  if (!raw) return c.body(null, 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return c.body(null, 400);
  }
  if (!isAllowed(target)) return c.body(null, 400);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { accept: c.req.header("accept") ?? "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return c.body(null, 404);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const contentLength = upstream.headers.get("content-length");
  if (
    !upstream.ok ||
    !upstream.body ||
    !contentType.startsWith("image/") ||
    (contentLength && Number(contentLength) > MAX_BYTES)
  ) {
    return c.body(null, 404);
  }

  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    "cross-origin-resource-policy": "cross-origin",
    "x-content-type-options": "nosniff",
  });
  // fetch decodes the body, so a forwarded length is only valid when unencoded.
  if (contentLength && !upstream.headers.get("content-encoding")) {
    headers.set("content-length", contentLength);
  }

  return new Response(upstream.body, { status: 200, headers });
});
