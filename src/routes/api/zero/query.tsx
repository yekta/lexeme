import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { createFileRoute } from "@tanstack/react-router";

import { getAuthData } from "@/server/zero";
import { queries } from "@/zero/queries";
import { schema } from "@/zero/schema";

/**
 * Where zero-cache asks what a client is allowed to see.
 *
 * It calls this once per synced query to have it transformed with a real
 * context, then serves the rows from its own replica. Authorization is the
 * `user_id` filter inside each query definition, and `ctx` here comes from the
 * verified session — so a client cannot widen its own window by asking
 * differently.
 */
const handler = async ({ request }: { request: Request }) => {
  const authData = await getAuthData(request);
  if (!authData) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await handleQueryRequest({
    handler: (name, args) => {
      const query = mustGetQuery(queries, name);
      return query.fn({ args, ctx: authData });
    },
    schema,
    request,
    userID: authData.user_id,
  });
  return Response.json(result);
};

export const Route = createFileRoute("/api/zero/query")({
  server: { handlers: { POST: handler } },
});
