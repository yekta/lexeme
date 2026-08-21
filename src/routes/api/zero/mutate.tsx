import { mustGetMutator } from "@rocicorp/zero";
import { handleMutateRequest } from "@rocicorp/zero/server";
import { createFileRoute } from "@tanstack/react-router";

import { dbProvider, getAuthData, serverMutators } from "@/server/zero";

/**
 * The authoritative half of every write.
 *
 * zero-cache forwards each queued mutation here; the same mutator that already
 * ran optimistically on the client runs again inside a Postgres transaction,
 * this time with `ctx` derived from the verified session rather than from
 * anything the client claimed. A 401 puts the Zero client into its needs-auth
 * state — it keeps working locally and re-syncs once the session is back.
 */
const handler = async ({ request }: { request: Request }) => {
  const authData = await getAuthData(request);
  if (!authData) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await handleMutateRequest({
    dbProvider,
    handler: (transact) =>
      transact(async (tx, name, args) => {
        const mutator = mustGetMutator(serverMutators, name);
        await mutator.fn({ tx, ctx: authData, args });
      }),
    request,
    userID: authData.user_id,
  });
  return Response.json(result);
};

export const Route = createFileRoute("/api/zero/mutate")({
  server: { handlers: { POST: handler } },
});
