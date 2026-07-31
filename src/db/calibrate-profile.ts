"use client";

import { cardsCollection, learningProfilesCollection } from "@/db/collections";
import { offlineAction } from "@/db/offline";

export type TMemoryStatePatch = {
  id: string;
  stability: number;
  difficulty: number;
};

export type TCalibrateInput = {
  profileId: string;
  w: number[];
  lastCalibratedAt: Date;
  /** Card memory states re-derived under the new weights. */
  memoryStates: TMemoryStatePatch[];
};

/** New weights plus the card states re-derived under them, in one durable
 * transaction. Also serves reset. Never touches `due`/`state`. */
export const calibrateProfileAction = offlineAction<TCalibrateInput>(
  "calibrateProfile",
  (v) => {
    learningProfilesCollection.update(v.profileId, (p) => {
      p.w = v.w;
      p.last_calibrated_at = v.lastCalibratedAt;
    });
    for (const state of v.memoryStates) {
      cardsCollection.update(state.id, (c) => {
        c.stability = state.stability;
        c.difficulty = state.difficulty;
      });
    }
  },
);
