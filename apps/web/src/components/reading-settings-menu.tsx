import type { TPositionUnit } from "@lexeme/shared";
import { useForm } from "@tanstack/react-form";
import { BookOpenIcon, FlameIcon, MapPinIcon, SettingsIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuItemText,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePositionUnit, useReadingGoal, useUpdateReadingGoal, type TReadingGoal } from "@/hooks/data/use-reading";

const goalSchema = z.object({
  daily_minutes: z.number().int("Whole minutes only").min(1, "At least 1 minute").max(24 * 60, "At most 24 hours"),
  day_starts_at: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
});

const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const fromClock = (clock: string) => {
  const [hours = 0, minutes = 0] = clock.split(":").map(Number);
  return hours * 60 + minutes;
};

const UNIT_META: Record<TPositionUnit, { label: string; icon: React.ElementType }> = {
  location: { label: "Locations", icon: MapPinIcon },
  page: { label: "Pages", icon: BookOpenIcon },
};

/** The Reading page's settings menu, by its title: progress units and the streak's settings. */
export function ReadingSettingsMenu() {
  const [isStreakOpen, setIsStreakOpen] = useState(false);
  const { goal, isPending } = useReadingGoal();
  const { unit, setUnit } = usePositionUnit();
  const { label, icon: UnitIcon } = UNIT_META[unit];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-lg" className="shrink-0 text-muted-foreground">
              <SettingsIcon className="size-5 shrink-0 group-data-popup-open/button:rotate-90 transition" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuItem
            className="cursor-pointer"
            closeOnClick={false}
            onClick={() => setUnit(unit === "location" ? "page" : "location")}
          >
            <UnitIcon className="size-5 shrink-0" />
            <DropdownMenuItemText>Progress Units: {label}</DropdownMenuItemText>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => setIsStreakOpen(true)}>
            <FlameIcon className="size-5 shrink-0" />
            <DropdownMenuItemText>Streak Settings</DropdownMenuItemText>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={isStreakOpen} onOpenChange={setIsStreakOpen}>
        <DialogContent>
          <ReadingGoalForm goal={goal} isPending={isPending} onDone={() => setIsStreakOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReadingGoalForm({ goal, isPending, onDone }: { goal: TReadingGoal; isPending: boolean; onDone: () => void }) {
  const mutation = useUpdateReadingGoal();
  const form = useForm({
    defaultValues: { daily_minutes: goal.daily_minutes, day_starts_at: toClock(goal.day_starts_at) },
    validators: { onMount: goalSchema, onChange: goalSchema, onSubmit: goalSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ daily_minutes: value.daily_minutes, day_starts_at: fromClock(value.day_starts_at) });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Streak Settings</DialogTitle>
        <DialogDescription>A day counts toward your streak once you've read for the goal that day.</DialogDescription>
      </DialogHeader>
      <FormWrapper>
        <form.Field name="daily_minutes">
          {(field) => (
            <FormFieldWrapper>
              <Label htmlFor={field.name}>Daily goal (minutes)</Label>
              <FormInput
                id={field.name}
                name={field.name}
                type="number"
                inputMode="numeric"
                min={1}
                max={24 * 60}
                value={Number.isNaN(field.state.value) ? "" : field.state.value}
                onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                onBlur={field.handleBlur}
              />
            </FormFieldWrapper>
          )}
        </form.Field>
        <form.Field name="day_starts_at">
          {(field) => (
            <FormFieldWrapper>
              <Label htmlFor={field.name}>Day starts at</Label>
              <FormInput
                id={field.name}
                name={field.name}
                type="time"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <p className="text-xs text-muted-foreground">Reading before this time counts toward the day before.</p>
            </FormFieldWrapper>
          )}
        </form.Field>
      </FormWrapper>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe selector={(s) => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, isDirty: s.isDirty })}>
          {({ canSubmit, isSubmitting, isDirty }) => (
            <Button type="submit" disabled={!canSubmit || !isDirty || isPending} isPending={isSubmitting}>
              Save
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
