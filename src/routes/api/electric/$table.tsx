import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/env";
import { auth } from "@/server/auth";

/**
 * Auth proxy in front of the Electric sync service (Electric's recommended
 * "proxy" auth pattern). The client never talks to Electric directly: this
 * route validates the Better Auth session, pins the shape definition
 * server-side (table + `user_id = $1` filter), and only passes through the
 * shape-log cursor parameters the client legitimately controls.
 */

/** Tables clients may sync. Each must carry a `user_id` column. */
const SYNCABLE_TABLES = new Set([
  "decks",
  "cards",
  "learning_profiles",
  "review_logs",
]);

/** Electric protocol params the client drives (shape-log position only). */
const PASSTHROUGH_PARAMS = ["offset", "handle", "live", "cursor"] as const;

const handler = async ({
  request,
  params,
}: {
  request: Request;
  params: { table: string };
}) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!SYNCABLE_TABLES.has(params.table)) {
    return new Response("Not found", { status: 404 });
  }

  const requestUrl = new URL(request.url);
  const originUrl = new URL("/v1/shape", env.ELECTRIC_URL);

  // Shape definition is server-controlled — the client cannot widen it.
  originUrl.searchParams.set("table", params.table);
  originUrl.searchParams.set("where", `"user_id" = $1`);
  originUrl.searchParams.set("params[1]", session.user.id);
  if (env.ELECTRIC_SECRET) {
    originUrl.searchParams.set("secret", env.ELECTRIC_SECRET);
  }

  for (const param of PASSTHROUGH_PARAMS) {
    const value = requestUrl.searchParams.get(param);
    if (value !== null) originUrl.searchParams.set(param, value);
  }

  const response = await fetch(originUrl, { signal: request.signal });

  // fetch already decompressed the body; forwarding the original
  // content-encoding/length headers would corrupt the response.
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const Route = createFileRoute("/api/electric/$table")({
  server: {
    handlers: {
      GET: handler,
    },
  },
});
