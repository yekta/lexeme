import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/server/auth";

/** Better Auth catch-all handler (sign-in, callbacks, session, sign-out). */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
