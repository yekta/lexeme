"use client";

import { api } from "@/trpc/react";

export function useTodayStats() {
  return api.stats.today.useQuery();
}

export function useDeckStats() {
  return api.stats.deckStats.useQuery();
}
