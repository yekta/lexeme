"use client";

import { api } from "@/trpc/react";

export function useTodayStats() {
  return api.stats.getToday.useQuery();
}

export function useDeckStats() {
  return api.stats.getDeckStats.useQuery();
}
