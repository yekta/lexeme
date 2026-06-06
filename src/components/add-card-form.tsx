"use client";

import { usePersistentForm } from "@/components/form-draft-provider";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCardsByDeck, useCreateCard } from "@/hooks/data/use-cards";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { z } from "zod";

const normalizeFront = (front: string) => front.trim().toLowerCase();

const cardSchema = z.object({
  front: z.string().trim().min(1, "Front is required"),
  back: z.string().trim().min(1, "Back is required"),
});

export function AddCardForm({
  deckId,
  deckName,
  onDone,
}: {
  deckId: string;
  deckName: string;
  onDone: () => void;
}) {
  const mutation = useCreateCard();
  const { data: cards } = useCardsByDeck(deckId);
  // Snapshot the existing fronts once, on mount. The form remounts every time
  // the dialog opens (keyed on open state), so this is always current when
  // shown — and it never includes the card being added this session, which is
  // what caused the duplicate notice to flicker as the form closed.
  const [existingFronts] = useState(
    () => new Set(cards.map((c) => normalizeFront(c.front))),
  );
  const form = usePersistentForm({
    id: "add-card",
    instanceId: deckId,
    defaultValues: { front: "", back: "" },
    validators: {
      onMount: cardSchema,
      onChange: cardSchema,
      onSubmit: cardSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        deckId,
        front: value.front,
        back: value.back,
      });
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
        <DialogTitle>Add Card</DialogTitle>
        <DialogDescription>
          The card will be added to "
          <span className="font-medium text-foreground">{deckName}</span>".
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <form.Field name="front">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Front (Question)</Label>
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="back">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Back (Answer)</Label>
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </form.Field>
      </div>
      <form.Subscribe
        selector={(s) => ({
          canSubmit: s.canSubmit,
          isSubmitting: s.isSubmitting,
          front: s.values.front,
        })}
      >
        {({ canSubmit, isSubmitting, front }) => {
          const trimmed = front.trim();
          const isDuplicate =
            trimmed !== "" && existingFronts.has(normalizeFront(front));
          return (
            <>
              {isDuplicate && (
                <div className="w-[calc(100%+0.5rem)] -mx-1 pb-4">
                  <DuplicateNotice />
                </div>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  isPending={isSubmitting}
                  variant={isDuplicate ? "warning" : "default"}
                >
                  {isDuplicate ? "Add Duplicate" : "Add Card"}
                </Button>
              </DialogFooter>
            </>
          );
        }}
      </form.Subscribe>
    </form>
  );
}

function DuplicateNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full flex flex-col gap-2 rounded-lg border bg-warning/10 border-warning/20 px-2.5 py-2.5",
        className,
      )}
    >
      <p className="text-sm text-warning">This card is already in the deck.</p>
    </div>
  );
}
