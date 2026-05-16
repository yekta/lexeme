"use client";

import { api } from "@/trpc/react";

export function useTodayReviewLogs() {
  return api.reviewLogs.today.useQuery();
}
