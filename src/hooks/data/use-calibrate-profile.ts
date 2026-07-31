"use client";

import {
  calibrateProfileAction,
  type TCalibrateInput,
} from "@/db/calibrate-profile";
import { toastOnPersistError } from "@/db/toast-on-error";

export type { TCalibrateInput };

/** React surface for committing a calibration (today: the reset action). */
export function useCalibrateProfile() {
  return {
    mutateAsync: async (input: TCalibrateInput) => {
      const tx = calibrateProfileAction(input);
      toastOnPersistError(tx, "Failed to reset calibration");
    },
  };
}
