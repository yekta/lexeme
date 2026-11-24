/** A reading session from a reader that kept no page numbers, only how many times the page was turned. */
export type TUnpagedSession = { started_at: number; seconds: number; page_turns: number | null };

export type TEstimatedPageRead = { page: number; started_at: number; seconds: number };

function sessionWeights(sessions: readonly TUnpagedSession[]) {
  const counted = sessions.filter((session) => session.page_turns !== null && session.seconds > 0);
  const turns = counted.reduce((sum, session) => sum + (session.page_turns ?? 0), 0);
  const seconds = counted.reduce((sum, session) => sum + session.seconds, 0);
  const turnsPerSecond = turns > 0 && seconds > 0 ? turns / seconds : null;
  return sessions.map((session) => {
    if (session.page_turns !== null) return session.page_turns;
    if (turnsPerSecond !== null) return session.seconds * turnsPerSecond;
    return session.seconds;
  });
}

/**
 * Spreads one book's sessions over its pages as a single read from start to
 * end: each session gets the next stretch of pages, as long as its share of
 * the page turns (or of the time, for sessions with no turn count), and its
 * time is split evenly over those pages.
 */
export function estimatePageReads(sessions: readonly TUnpagedSession[], pages: number): TEstimatedPageRead[] {
  if (pages < 1 || sessions.length === 0) return [];
  const ordered = [...sessions].sort((a, b) => a.started_at - b.started_at);
  const weights = sessionWeights(ordered);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const reads: TEstimatedPageRead[] = [];
  let done = 0;
  ordered.forEach((session, i) => {
    const from = total > 0 ? done / total : i / ordered.length;
    done += weights[i] ?? 0;
    const to = total > 0 ? done / total : (i + 1) / ordered.length;
    const first = Math.min(pages, Math.floor(from * pages) + 1);
    const last = Math.max(first, Math.min(pages, Math.floor(to * pages)));
    const count = last - first + 1;
    const each = Math.floor(session.seconds / count);
    for (let page = first; page <= last; page++) {
      const index = page - first;
      const seconds = page === last ? session.seconds - each * (count - 1) : each;
      reads.push({ page, started_at: session.started_at + index * each * 1000, seconds });
    }
  });
  return reads;
}
