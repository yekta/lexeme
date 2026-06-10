import { ConvexError } from "convex/values";

/**
 * Read the error code (e.g. "NOT_FOUND") off a thrown Convex error. Convex
 * functions throw `new ConvexError({ code })`; the code rides along in
 * `error.data`. Also recognises any error carrying a plain string `code`
 * property — used by `DataError` so collection-derived states classify the
 * same way a server error would.
 */
export function convexErrorCode(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    const data = error.data as { code?: unknown } | undefined;
    if (data && typeof data.code === "string") return data.code;
  }
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
 * thrown by the server — e.g. a deck that simply isn't in the synced data.
 * `code` mirrors the server error codes so `convexErrorCode` (and thus
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
    switch (convexErrorCode(query.error)) {
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
