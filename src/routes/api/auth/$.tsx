import { createAuth } from "@/server/auth";
import { withDatabase } from "@/server/db";
import { createFileRoute } from "@tanstack/react-router";

const handler = ({ request }: { request: Request }) =>
  withDatabase((db) => createAuth(db).handler(request));

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
