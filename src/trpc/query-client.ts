import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import superjson from "superjson";

/**
 * tRPC error codes that describe a settled answer — retrying them just repeats
 * the same response (a missing deck stays missing). Everything else (network
 * blips, INTERNAL_SERVER_ERROR, TIMEOUT, …) is worth retrying.
 */
const NON_RETRYABLE_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "UNPROCESSABLE_CONTENT",
  "METHOD_NOT_SUPPORTED",
  "NOT_IMPLEMENTED",
  "PARSE_ERROR",
]);

/** Read the tRPC error code (e.g. "NOT_FOUND") off a thrown client error. */
export function trpcErrorCode(error: unknown): string | undefined {
  return error instanceof TRPCClientError
    ? (error.data?.code as string | undefined)
    : undefined;
}

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (NON_RETRYABLE_CODES.has(trpcErrorCode(error) ?? "")) {
            return false;
          }
          return failureCount < 2; // 3 attempts total for genuine errors
        },
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
