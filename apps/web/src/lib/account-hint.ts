/**
 * What this device knew last time.
 *
 * Zero has no "the local store has finished opening" event, and its per-query
 * `details` answer a different question than the screens are asking: `unknown`
 * means *the server has not confirmed this query*, which on a device that is
 * offline — or merely slow — never happens. Treating that as "loading" is what
 * put a skeleton over an archive sitting on disk.
 *
 * So the one question the UI actually needs answered on boot — *should this
 * device expect rows?* — is answered by the device itself. Two counts,
 * rewritten whenever a screen settles. They are wrong only in the direction of
 * waiting a beat longer (an account emptied on another device) or opening
 * straight into the empty state (a first deck created elsewhere), and they heal
 * on the next settle either way.
 */

const KEY = "lexeme:account";

export type TAccountHint = {
  /** How many decks this device last saw. */
  decks: number;
  /**
   * How many review logs it last saw. Tracked separately from decks because it
   * is preloaded separately: the deck list is not made to wait on the heaviest
   * table in the account (zero/preload.ts), so the screens that read reviews
   * need their own answer to "are these coming?".
   */
  logs: number;
  /** When it saw them, epoch ms. */
  at: number;
};

export function loadAccountHint(): TAccountHint | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TAccountHint>;
    if (typeof parsed.decks !== "number") return null;
    return { decks: parsed.decks, logs: parsed.logs ?? 0, at: parsed.at ?? 0 };
  } catch {
    // Unparseable, or storage blocked. No hint is a perfectly good answer.
    return null;
  }
}

export function saveAccountHint(hint: { decks: number; logs: number }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...hint, at: Date.now() } satisfies TAccountHint));
  } catch {
    // Private mode or quota: the app simply waits for rows next time.
  }
}

export function clearAccountHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
