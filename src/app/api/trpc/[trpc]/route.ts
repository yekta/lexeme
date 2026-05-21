import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { env } from "@/env";

const createContext = (req: NextRequest) =>
  createTRPCContext({ headers: req.headers });

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
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

export { handler as GET, handler as POST };
