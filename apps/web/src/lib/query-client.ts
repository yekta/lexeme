import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";

/**
 * Codes that describe a settled answer: retrying them just repeats the same
 * response, because a missing deck stays missing. Everything else (a dropped
 * connection, a 500, a timeout) is worth another go.
 */
const NON_RETRYABLE_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
]);

/**
 * Read the error code off a thrown API error.
 *
 * Also recognises anything carrying a plain string `code`, which is what
 * `DataError` uses, so a condition derived on the client (a deck that simply
 * is not in the synced set) classifies the same way a server refusal would.
 */
export function apiErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.code;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
}

/**
 * The React Query client.
 *
 * It has far less to do than it did: every read and every write in this app is
 * a Zero synced query or a shared mutator, answered from the browser's own
 * store. What is left on the network is the deck export and the two model
 * calls, all of them user-initiated mutations, so this is really just their
 * retry policy and their in-flight state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !NON_RETRYABLE_CODES.has(apiErrorCode(error) ?? "") && failureCount < 2,
    },
    mutations: {
      retry: (failureCount, error) =>
        !NON_RETRYABLE_CODES.has(apiErrorCode(error) ?? "") && failureCount < 1,
    },
  },
});
