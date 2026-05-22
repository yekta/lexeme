import { trpcErrorCode } from "@/trpc/query-client";

/**
 * The four data states a resource query can settle into, plus the in-flight
 * "pending" state. `not-found`, `forbidden` and `unauthorized` are settled
 * answers (never retried); `error` is an unknown failure (retried).
 */
export type DataState =
  | "pending"
  | "ready"
  | "not-found"
  | "forbidden"
  | "unauthorized"
  | "error";

/**
 * A settled, non-retryable data condition derived on the client rather than
 * thrown by the server — e.g. a deck that simply isn't in the synced
 * collection. `code` mirrors the tRPC error codes so `trpcErrorCode` (and thus
 * `dataStateOf`) classifies it identically.
 */
export class DataError extends Error {
  constructor(public code: "NOT_FOUND" | "FORBIDDEN" | "UNAUTHORIZED") {
    super(code);
    this.name = "DataError";
  }
}

type QueryLike = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
};

/** Classify a React Query result into a single `DataState`. */
export function dataStateOf(query: QueryLike): DataState {
  if (query.isError) {
    switch (trpcErrorCode(query.error)) {
      case "NOT_FOUND":
        return "not-found";
      case "FORBIDDEN":
        return "forbidden";
      case "UNAUTHORIZED":
        return "unauthorized";
      default:
        return "error";
    }
  }
  return query.isPending ? "pending" : "ready";
}

// Higher wins: a page with several queries shows the most meaningful state
// rather than a spinner that never resolves.
const SEVERITY: Record<DataState, number> = {
  error: 5,
  unauthorized: 4,
  forbidden: 3,
  "not-found": 2,
  pending: 1,
  ready: 0,
};

/** Combine several query states into the single most-severe one. */
export function mergeStates(...states: DataState[]): DataState {
  return states.reduce((worst, s) => (SEVERITY[s] > SEVERITY[worst] ? s : worst));
}
