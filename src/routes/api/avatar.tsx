import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_HOST_SUFFIX = ".googleusercontent.com";
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

function isAllowed(target: URL) {
  return (
    target.protocol === "https:" &&
    target.hostname.endsWith(ALLOWED_HOST_SUFFIX)
  );
}

const handler = async ({ request }: { request: Request }) => {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return new Response(null, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!isAllowed(target)) return new Response(null, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { accept: request.headers.get("accept") ?? "image/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return new Response(null, { status: 404 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const contentLength = upstream.headers.get("content-length");
  if (
    !upstream.ok ||
    !upstream.body ||
    !contentType.startsWith("image/") ||
    (contentLength && Number(contentLength) > MAX_BYTES)
  ) {
    return new Response(null, { status: 404 });
  }

  const headers = new Headers({
    "content-type": contentType,
    "cache-control":
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  // fetch decodes the body, so a forwarded length is only valid when unencoded.
  if (contentLength && !upstream.headers.get("content-encoding")) {
    headers.set("content-length", contentLength);
  }

  return new Response(upstream.body, { status: 200, headers });
};

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: handler,
    },
  },
});
