import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const handler = ({ request }: { request: Request }) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: request.headers }),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(`[trpc] ${path ?? "<no-path>"}: ${error.message}`);
            let cause: unknown = error.cause;
            let depth = 0;
            while (cause && depth < 5) {
              const c = cause as { message?: string; cause?: unknown };
              console.error(`  cause[${depth}]:`, c.message ?? cause);
              cause = c.cause;
              depth++;
            }
          }
        : undefined,
  });

export const Route = createFileRoute("/api/trpc/$")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});
