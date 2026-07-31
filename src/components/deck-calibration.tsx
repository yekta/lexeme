"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { useForm } from "@tanstack/react-form";
import { LoaderIcon, RotateCcwIcon } from "lucide-react";
import { z } from "zod";

import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cardIdsForProfile } from "@/db/auto-calibration";
import {
  cardsCollection,
  decksCollection,
  reviewLogsCollection,
  type LearningProfileRow,
} from "@/db/collections";
import { useCalibrateProfile } from "@/hooks/data/use-calibrate-profile";
import { useDecks } from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import {
  useCalibrationState,
  useIsCalibrating,
} from "@/lib/fsrs/calibration-status";
import { FSRS_DEFAULT_W, isCalibrated } from "@/lib/fsrs/fsrs";
import {
  memoryStatesFor,
  MIN_REVIEWS_TO_CALIBRATE,
} from "@/lib/fsrs/fsrs-calibration";
import {
  buildCardHistories,
  countLongTermReviews,
} from "@/lib/fsrs/fsrs-history";
import { cn } from "@/lib/utils";

export const RESET_CALIBRATION_CONFIRMATION = "I want to reset calibration";

const resetCalibrationSchema = z.object({
  confirmation: z
    .string()
    .refine(
      (v) => v === RESET_CALIBRATION_CONFIRMATION,
      "Confirmation text does not match",
    ),
});

/**
 * Marks the settings trigger while a pass is running. Always mounted and
 * animated on opacity/scale so it can never shift the card's layout.
 */
export function CalibrationDot({ profileId }: { profileId: string }) {
  const isCalibrating = useIsCalibrating(profileId);
  return (
    <span
      data-calibrating={isCalibrating || undefined}
      aria-hidden
      className="absolute right-1.5 top-1.5 size-1 rounded-full bg-warning opacity-0 scale-50 data-calibrating:opacity-100 data-calibrating:animate-pulse data-calibrating:scale-100 transition"
    />
  );
}

/**
 * The calibration part of the deck settings dropdown: the reset action and the
 * status line.
 *
 * Rendered inside `DropdownMenuContent`, which Base UI unmounts while closed —
 * so the profile lookup only runs while the menu is open, rather than once per
 * deck card on the index route.
 */
export function CalibrationMenuItem({
  profileId,
  onReset,
}: {
  profileId: string;
  onReset: () => void;
}) {
  const { data: profiles } = useLearningProfiles();
  const profile = profiles?.find((p) => p.id === profileId);
  const isProfileCalibrated = profile ? isCalibrated(profile.w) : false;

  if (!isProfileCalibrated) return null;

  return (
    <DropdownMenuItem
      variant="destructive"
      className="cursor-pointer"
      disabled={!isProfileCalibrated}
      onClick={onReset}
    >
      <RotateCcwIcon className="size-5 shrink-0" />
      <DropdownMenuItemText>Reset Calibration</DropdownMenuItemText>
    </DropdownMenuItem>
  );
}

export function CalibrationFooterSection({ profileId }: { profileId: string }) {
  const { data: profiles } = useLearningProfiles();
  const profile = profiles?.find((p) => p.id === profileId);
  return (
    <>
      <DropdownMenuSeparator />
      <CalibrationFooter profile={profile} />
    </>
  );
}

/** Cross-day reviews on this profile — the only ones FSRS can learn from. */
function useLongTermReviewCount(profileId: string | undefined): number {
  const cardIds = profileId
    ? cardIdsForProfile(
        profileId,
        decksCollection.toArray,
        cardsCollection.toArray,
      )
    : new Set<string>();
  return countLongTermReviews(
    buildCardHistories(cardIds, reviewLogsCollection.toArray),
  );
}

function calibrationLabel(
  profile: LearningProfileRow,
  longTermReviews: number,
): string {
  if (profile.last_calibrated_at) {
    const ago = formatDistanceToNowStrict(
      new Date(profile.last_calibrated_at),
      { addSuffix: true },
    );
    return `Calibrated ${ago}`;
  }
  return longTermReviews < MIN_REVIEWS_TO_CALIBRATE
    ? "Not enough data for calibration"
    : "Not calibrated yet";
}

export function CalibrationFooter({
  profile,
  className,
}: {
  profile: LearningProfileRow | undefined;
  className?: string;
}) {
  const state = useCalibrationState(profile?.id);
  const isCalibrating = state === "running";
  const longTermReviews = useLongTermReviewCount(profile?.id);

  const label = !profile
    ? " "
    : isCalibrating
      ? "Calibrating..."
      : state === "insufficient-data"
        ? "Not enough data for calibration"
        : calibrationLabel(profile, longTermReviews);

  return (
    <div
      data-calibrating={isCalibrating || undefined}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs text-muted-more-foreground data-calibrating:text-warning",
        className,
      )}
    >
      {isCalibrating && <LoaderIcon className="size-3 shrink-0 animate-spin" />}
      <span className="shrink min-w-0 wrap-break-word leading-tight">
        {label}
      </span>
    </div>
  );
}

/**
 * Resets a profile's FSRS weights to the shipped defaults. This is a
 * calibration to a known `w`, so it reuses the same commit path — including
 * re-deriving card memory states, which keeps stored state consistent with the
 * weights that produced it.
 */
export function ResetCalibrationForm({
  profileId,
  onDone,
}: {
  profileId: string;
  onDone: () => void | Promise<void>;
}) {
  const mutation = useCalibrateProfile();
  const { data: profiles } = useLearningProfiles();
  const { data: decks } = useDecks();
  const profile = profiles?.find((p) => p.id === profileId);
  // Every deck on this profile — the blast radius of the reset.
  const deckNames = decks
    .filter((d) => d.learning_profile_id === profileId)
    .map((d) => d.name);
  const form = useForm({
    defaultValues: { confirmation: "" },
    validators: {
      onMount: resetCalibrationSchema,
      onChange: resetCalibrationSchema,
      onSubmit: resetCalibrationSchema,
    },
    onSubmit: async () => {
      if (!profile) return;
      const cardIds = cardIdsForProfile(
        profileId,
        decksCollection.toArray,
        cardsCollection.toArray,
      );
      const histories = buildCardHistories(
        cardIds,
        reviewLogsCollection.toArray,
      );
      await mutation.mutateAsync({
        profileId,
        w: [...FSRS_DEFAULT_W],
        // Stamped so auto-calibration doesn't immediately re-derive the very
        // parameters this reset just discarded.
        lastCalibratedAt: new Date(),
        memoryStates: memoryStatesFor(histories, FSRS_DEFAULT_W),
      });
      await onDone();
    },
  });

  const others = deckNames.length - 1;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Reset Calibration</DialogTitle>
        <DialogDescription>
          This discards the FSRS parameters learned from your review history and
          restores the defaults for the &quot;{profile?.name ?? ""}&quot;
          learning profile.
          {others > 0
            ? ` That affects every deck using it — ${deckNames.join(", ")}.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      <FormWrapper>
        <FormFieldWrapper>
          <p className="text-sm text-muted-foreground mb-2">
            Please type{" "}
            <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono font-medium">
              {RESET_CALIBRATION_CONFIRMATION}
            </span>{" "}
            to confirm.
          </p>
          <form.Field name="confirmation">
            {(field) => (
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder={RESET_CALIBRATION_CONFIRMATION}
              />
            )}
          </form.Field>
        </FormFieldWrapper>
      </FormWrapper>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              variant="destructive"
              disabled={!canSubmit}
              isPending={isSubmitting}
            >
              Reset
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
