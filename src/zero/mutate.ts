"use client";

import type { MutatorResult } from "@rocicorp/zero";
import { Store } from "@tanstack/store";
import { useCallback, useSyncExternalStore } from "react";

import { toastErrorOnOptimisticOperation } from "@/components/mutation-error-toast";

/**
 * Running a mutation, and knowing which rows are still in flight.
 *
 * Two things live here because they are the same moment. Zero hands back a
 * `MutatorResult` whose `client` and `server` promises both **resolve** — a
 * failure arrives as `{type: "error"}`, never as a rejection — so a bare
 * `await zero.mutate(...)` inside a try/catch reads like error handling and is
 * not: the catch never runs, the optimistic write is rolled back, and a form
 * that closes on success closes on failure too, silently, taking what was typed
 * with it. Everything below funnels through `commit`, which turns that back
 * into something the app can see.
 *
 * The in-flight bookkeeping is the other half. TanStack DB stamped a `$synced`
 * flag on every row, which is what the spinner on a card or a deck used to
 * read; Zero has no equivalent, so a mutation registers the row ids it touches
 * and clears them when the server settles. Same per-row fidelity, tracked one
 * level up — and it covers deletes, which `$synced` never could, because an
 * optimistically deleted row is simply gone.
 */

type TPending = {
  /** Row ids with a mutation in flight, across every table. */
  ids: ReadonlySet<string>;
  /** In-flight mutation count per table, for "something here is saving". */
  kinds: Readonly<Record<string, number>>;
};

const pending = new Store<TPending>({ ids: new Set<string>(), kinds: {} });

function addPending(kind: string, ids: readonly string[]): void {
  pending.setState((s) => {
    const next = new Set(s.ids);
    for (const id of ids) next.add(id);
    return { ids: next, kinds: { ...s.kinds, [kind]: (s.kinds[kind] ?? 0) + 1 } };
  });
}

function removePending(kind: string, ids: readonly string[]): void {
  pending.setState((s) => {
    const next = new Set(s.ids);
    for (const id of ids) next.delete(id);
    return {
      ids: next,
      kinds: { ...s.kinds, [kind]: Math.max(0, (s.kinds[kind] ?? 0) - 1) },
    };
  });
}

function subscribe(onChange: () => void) {
  return pending.subscribe(onChange).unsubscribe;
}

/**
 * The row ids currently being saved. Read it once per list and test membership,
 * rather than subscribing per row.
 */
export function usePendingIds(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => pending.state.ids,
    () => EMPTY_IDS,
  );
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** True while any mutation against `kind` is in flight (including deletes). */
export function usePendingMutations(kind: string): boolean {
  const getSnapshot = useCallback(
    () => (pending.state.kinds[kind] ?? 0) > 0,
    [kind],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

function messageOf(details: MutatorResultDetailsError): string {
  return details.error.message || "Please try again.";
}

type MutatorResultDetailsError = Extract<
  Awaited<MutatorResult["client"]>,
  { type: "error" }
>;

type TCommitOptions = {
  kind: string;
  rows?: readonly string[];
  message: string;
};

function track(
  result: MutatorResult,
  { kind, rows = [], message }: TCommitOptions,
  reportClientError: boolean,
): void {
  addPending(kind, rows);

  // At most one toast per mutation. A rejected optimistic run resolves the
  // server promise with the same error, so reporting both would say it twice.
  let reported = false;
  const report = (details: MutatorResultDetailsError) => {
    if (reported) return;
    reported = true;
    toastErrorOnOptimisticOperation({
      message,
      description: messageOf(details),
    });
  };

  void result.client.then((outcome) => {
    if (outcome.type === "error") {
      // When the caller is awaiting, the throw is its to handle: it still has
      // the form open and can say so in place, which beats a toast.
      if (reportClientError) report(outcome);
      else reported = true;
    }
  });

  // The authoritative run can still refuse what the optimistic one accepted: a
  // server on an older build, a row that moved underneath it, a session that
  // expired mid-flight. Zero rolls the write back when that happens, and by
  // then the screen that issued it has usually moved on — so a toast is the
  // only place left to say so.
  void result.server
    .then((settled) => {
      if (settled.type === "error") report(settled);
    })
    .finally(() => removePending(kind, rows));
}

/**
 * Fire a mutation and take responsibility for its outcome.
 *
 * `rows` are the ids whose UI should show as saving until the server confirms;
 * `kind` is the table, for the coarser "a delete is in flight here" signal.
 */
export function commit(result: MutatorResult, options: TCommitOptions): void {
  track(result, options, true);
}

/**
 * `commit`, awaited, for callers that need to know before moving on — a form
 * that should stay open and keep what was typed if the write is refused.
 * Rejects on failure so an ordinary try/catch means what it reads as.
 */
export async function commitAsync(
  result: MutatorResult,
  options: TCommitOptions,
): Promise<void> {
  track(result, options, false);
  const outcome = await result.client;
  if (outcome.type === "error") throw new Error(messageOf(outcome));
}
