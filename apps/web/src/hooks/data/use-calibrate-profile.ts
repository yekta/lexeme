import { useZero } from "@rocicorp/zero/react";

import { commit } from "@/zero/mutate";
import { mutators } from "@lexeme/contracts";

export type TMemoryStatePatch = {
  id: string;
  stability: number;
  difficulty: number;
};

export type TCalibrateInput = {
  profileId: string;
  w: number[];
  /** Epoch ms, like every other timestamp Zero carries. */
  lastCalibratedAt: number;
  /** Card memory states re-derived under the new weights. */
  memoryStates: TMemoryStatePatch[];
};

/**
 * Commit a calibration: new weights plus the card states re-derived under them,
 * in one mutation so the two can never disagree. Also serves reset, which is a
 * calibration to the default weights. Never touches `due`/`state`.
 */
export function useCalibrateProfile() {
  const zero = useZero();
  return {
    mutateAsync: async (input: TCalibrateInput) => {
      commit(
        zero.mutate(
          mutators.learningProfile.calibrate({
            id: input.profileId,
            w: input.w,
            last_calibrated_at: input.lastCalibratedAt,
            memory_states: input.memoryStates,
          }),
        ),
        {
          kind: "learning_profiles",
          rows: [input.profileId, ...input.memoryStates.map((s) => s.id)],
          message: "Failed to reset calibration",
        },
      );
    },
  };
}
