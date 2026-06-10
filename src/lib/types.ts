import type { FunctionReturnType } from "convex/server";

import type { api } from "@/lib/convex-api";

// Row shapes are derived straight from the Convex query return types so the
// client and backend can never drift. Timestamps are epoch-ms numbers and ids
// are Convex document ids (assignable to `string`).
export type DeckRow = FunctionReturnType<typeof api.decks.list>[number];
export type CardRow = FunctionReturnType<typeof api.cards.listByUser>[number];
export type LearningProfileRow = FunctionReturnType<
  typeof api.learningProfiles.list
>[number];
export type ReviewLogRow = FunctionReturnType<
  typeof api.reviewLogs.listToday
>[number];

export type TCardStateEnum = CardRow["state"];
export type TLearningProfile = LearningProfileRow;
