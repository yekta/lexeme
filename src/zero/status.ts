"use client";

import type { QueryResultDetails } from "@rocicorp/zero";

/**
 * Turn Zero's per-query result details into the `{isPending, isError, error}`
 * shape the page-level `dataStateOf` helper reads.
 *
 * The rule that matters: **having rows beats not having heard.** Zero reports
 * `unknown` until the server confirms a query, and on a device that is offline
 * — or merely slow — that never happens. Treating `unknown` as "loading" would
 * put a skeleton over an archive that is sitting right there on disk, which is
 * the exact failure this whole migration exists to remove. So a query that has
 * produced rows is ready, whatever the server has or hasn't said; only a query
 * with nothing to show and no answer yet is pending.
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

export function zeroStatus(
  hasRows: boolean,
  ...details: ReadonlyArray<QueryResultDetails>
): TQueryStatus {
  const isError = details.some((d) => d.type === "error");
  const heard = details.every((d) => d.type !== "unknown");
  return {
    isPending: !isError && !heard && !hasRows,
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
