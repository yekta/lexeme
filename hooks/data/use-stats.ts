"use client";

import { useMemo } from "react";
import { useTodayReviewLogs } from "./use-review-logs";

export type TTodayStats = {
  count: number;
  totalMs: number;
  msPerCard: number;
};

export function useTodayStats() {
  const query = useTodayReviewLogs();
  const data = useMemo<TTodayStats>(() => {
    const logs = query.data ?? [];
    const totalMs = logs.reduce((acc, l) => acc + l.duration_ms, 0);
    return {
      count: logs.length,
      totalMs,
      msPerCard: logs.length ? totalMs / logs.length : 0,
    };
  }, [query.data]);
  return { ...query, data };
}
