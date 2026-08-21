import { queries } from "@lexeme/contracts";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";

import { loadAccountHint, saveAccountHint } from "@/lib/account-hint";
import { SETTLE_BUDGET, useHeld } from "@/lib/settle";
import { isSyncPaused, useSyncStatus } from "@/lib/sync-status";
import { usePreloadComplete } from "@/zero/preload";

export type TDataReady = {
  /** Decks, cards and profiles are on the device: every screen may draw itself. */
  account: boolean;
  /** Review logs are here too: the numbers derived from them may be shown. */
  logs: boolean;
};

/**
 * Whether the screens may draw themselves.
 *
 * This replaces the per-query `isPending` every screen used to compute from
 * Zero's result details, and it is the fix for two bugs that were really one
 * bug. Creating a deck and landing on it showed a loading skeleton, because the
 * new deck's card query had no rows and had not been confirmed by the server —
 * so it read as "still loading" when the honest answer was "this deck is empty,
 * you just made it". An account with no decks at all had the same problem on
 * the home screen, permanently.
 *
 * The mistake was asking per query. Every screen draws from one preloaded set,
 * so there is one moment worth waiting for, and after it every screen is ready,
 * empty ones included.
 *
 * Two moments, in fact, because the preload is deliberately two passes
 * (zero/preload.ts). `logs` trails `account` so the deck list does not wait on
 * the heaviest table in the account — and so the stats footer does not announce
 * "you haven't studied today" a beat before today's reviews arrive.
 *
 * Each branch below is an answer, not a guess:
 *
 *   - the pass completed          the server told us everything it has
 *   - there are rows on screen    the local store answered; rows beat silence
 *   - the device knew it was empty  an empty account is a state, not a wait
 *   - sync is paused              offline: what is local is all there is
 *   - the budget is spent         a backstop, so a wedged sync is never a
 *                                 screen you cannot leave
 *
 * The first four are the normal paths. The last should never fire.
 */
export function useDataReady(): TDataReady {
  const preload = usePreloadComplete();
  const [decks] = useQuery(queries.decks());
  const [logs] = useQuery(queries.reviewLogs());
  const sync = useSyncStatus(false);
  const paused = isSyncPaused(sync);

  // Read once. This is what the device knew before Zero opened its store, and
  // it must not change under us mid-boot.
  const hint = useRef(loadAccountHint()).current;
  const accountBudgetSpent = useHeld(!preload.account, SETTLE_BUDGET.account);
  const logsBudgetSpent = useHeld(!preload.logs, SETTLE_BUDGET.account);

  const account =
    preload.account || decks.length > 0 || hint?.decks === 0 || paused || accountBudgetSpent;

  const logsReady =
    preload.logs || logs.length > 0 || hint?.logs === 0 || paused || logsBudgetSpent;

  // Record what was actually painted, for the next boot to expect. Only ever a
  // settled truth, never a way-station: the log count is written only once the
  // logs themselves are ready, or a first boot on a busy account would save
  // `logs: 0` and open straight into the empty state next time.
  useEffect(() => {
    if (!account) return;
    saveAccountHint({
      decks: decks.length,
      logs: logsReady ? logs.length : (hint?.logs ?? 0),
    });
  }, [account, logsReady, decks.length, logs.length, hint?.logs]);

  return { account, logs: logsReady };
}
