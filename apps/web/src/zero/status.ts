import type { QueryResultDetails } from "@rocicorp/zero";

import { useAccountReady, useReviewLogsReady } from "@/zero/account";

/**
 * Turn Zero's per-query result details into the `{isPending, isError, error}`
 * shape the page-level `dataStateOf` helper reads.
 *
 * The rule that matters: **pending is a property of the account, not of a
 * query.** Zero reports `unknown` until the server confirms a query, which on a
 * device that is offline — or merely slow — never happens, and which is also
 * the state a query the server has genuinely never been asked about sits in.
 * Reading that as "loading" is what put a skeleton over a deck that had just
 * been created and a spinner over an account that had no decks yet, forever.
 *
 * Every screen here draws from one preloaded set, so there is one moment worth
 * waiting for — `useAccountReady` — and after it a query with no rows means
 * *empty*, which is a screen the app knows how to draw.
 *
 * `error` is separate and does mean something: the query was refused (a bad
 * definition, a session the server rejected), and no amount of waiting fixes it.
 */
export type TQueryStatus = {
  isPending: boolean;
  isError: boolean;
  error: Error | undefined;
  refetch: () => void;
};

export function useZeroStatus(
  hasRows: boolean,
  ...details: ReadonlyArray<QueryResultDetails>
): TQueryStatus {
  return useReadyStatus(useAccountReady(), hasRows, details);
}

/**
 * The same thing for screens whose content is derived from the review history,
 * which lands after everything else. Without this the deck badges and the
 * stats footer would state a number the moment the decks arrive and correct it
 * a beat later, which is exactly the flash the split preload exists to avoid.
 */
export function useReviewStatus(
  hasRows: boolean,
  ...details: ReadonlyArray<QueryResultDetails>
): TQueryStatus {
  return useReadyStatus(useReviewLogsReady(), hasRows, details);
}

function useReadyStatus(
  ready: boolean,
  hasRows: boolean,
  details: ReadonlyArray<QueryResultDetails>,
): TQueryStatus {
  const isError = details.some((d) => d.type === "error");
  return {
    // Rows beat readiness: whatever the account is doing, data on screen is not
    // a loading state.
    isPending: !isError && !ready && !hasRows,
    isError,
    error: isError
      ? new Error("Syncing failed. Check your connection and retry.")
      : undefined,
    // Zero reconnects and re-runs its queries on its own; there is no refetch
    // to issue. Kept so the call sites that expect a retry affordance keep
    // their shape.
    refetch: () => {},
  };
}
