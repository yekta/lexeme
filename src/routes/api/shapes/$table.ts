import { ELECTRIC_PROTOCOL_QUERY_PARAMS } from "@electric-sql/client";
import { createFileRoute } from "@tanstack/react-router";
import { SYNCED_TABLES, type TSyncedTable } from "@/lib/db-types";
import { env } from "@/env";
import { auth } from "@/server/auth";

/**
 * Auth-aware ElectricSQL shape proxy.
 *
 * The browser only ever talks to this route — never to Electric directly. Here
 * we (1) require a Better Auth session, (2) restrict the shape to a known table,
 * and (3) inject `where user_id = <session user>` so a client can never read
 * another user's rows. Electric's source credentials stay server-side.
 */
async function proxyShape(request: Request, table: string): Promise<Response> {
  if (!SYNCED_TABLES.includes(table as TSyncedTable)) {
    return new Response("Unknown table", { status: 404 });
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const requestUrl = new URL(request.url);
  const electricUrl = new URL(env.ELECTRIC_URL);

  // Forward only Electric's own sync-protocol params (offset, handle, live, …).
  for (const key of ELECTRIC_PROTOCOL_QUERY_PARAMS) {
    const value = requestUrl.searchParams.get(key);
    if (value !== null) electricUrl.searchParams.set(key, value);
  }

  // Server-controlled: credentials, table, and the per-user row filter.
  electricUrl.searchParams.set("source_id", env.ELECTRIC_SOURCE_ID);
  electricUrl.searchParams.set("secret", env.ELECTRIC_SECRET);
  electricUrl.searchParams.set("table", table);
  electricUrl.searchParams.set("where", `"user_id" = $1`);
  electricUrl.searchParams.set("params[1]", session.user.id);

  const response = await fetch(electricUrl);

  // Drop hop-by-hop headers that don't survive being re-emitted.
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/shapes/$table")({
  server: {
    handlers: {
      GET: ({ request, params }) => proxyShape(request, params.table),
    },
  },
});
