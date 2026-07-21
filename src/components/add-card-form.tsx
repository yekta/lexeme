"use client";

import ErrorCard from "@/components/error-card";
import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { usePersistentForm } from "@/components/form-draft-provider";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SuggestButton } from "@/components/suggest-button";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormTextarea } from "@/components/ui/textarea";
import { useCardsByDeck, useCreateCard } from "@/hooks/data/use-cards";
import { GENERATE_CARD_EXCLUDE_FRONTS_LIMIT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
  const {
    isPending: isPendingGenerateBack,
    mutateAsync: mutateGenerateBack,
    error: errorGenerateBack,
  } = api.cards.generateBack.useMutation();
  const {
    isPending: isPendingGenerateCard,
    mutateAsync: mutateGenerateCard,
    error: errorGenerateCard,
  } = api.cards.generateCard.useMutation();
  // While either suggestion runs, both buttons pause — a back suggestion
  // racing a full-card suggestion would silently overwrite it.
  const isPendingSuggest = isPendingGenerateBack || isPendingGenerateCard;
  const error = errorGenerateBack ?? errorGenerateCard;
  const { data: cards } = useCardsByDeck(deckId);
  // Snapshot the existing fronts once, on mount. The form remounts every time
  // the dialog opens (keyed on open state), so this is always current when
  // shown — and it never includes the card being added this session, which is
  // what caused the duplicate notice to flicker as the form closed.
  const [existingFronts] = useState(
    () => new Set(cards.map((c) => normalizeFront(c.front))),
  );
  // Fronts already suggested this dialog session, sent back with each
  // generateCard call so repeated clicks don't return the same card twice.
  // The form remounts every time the dialog opens, so the list resets with
  // it. Capped to match the server's input limit.
  const suggestedFrontsRef = useRef<string[]>([]);
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
      className="min-w-0"
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
      <FormWrapper className="min-w-0">
        <form.Field name="front">
          {(field) => (
            <FormFieldWrapper>
              <div className="w-full flex items-center justify-between gap-4 min-w-0">
                <Label htmlFor={field.name} className="shrink min-w-0 truncate">
                  Front (Question)
                </Label>
                {cards.length > 0 && (
                  <SuggestButton
                    isPending={isPendingGenerateCard}
                    disabled={isPendingSuggest}
                    onClick={async () => {
                      try {
                        const { front, back } = await mutateGenerateCard({
                          deckId,
                          excludeFronts: suggestedFrontsRef.current,
                        });
                        suggestedFrontsRef.current = [
                          ...suggestedFrontsRef.current,
                          front,
                        ].slice(-GENERATE_CARD_EXCLUDE_FRONTS_LIMIT);
                        field.handleChange(front);
                        form.setFieldValue("back", back);
                      } catch (err) {
                        console.log(err);
                      }
                    }}
                  />
                )}
              </div>
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormFieldWrapper>
          )}
        </form.Field>
        <form.Field name="back">
          {(field) => (
            <FormFieldWrapper className="min-w-0">
              <div className="w-full flex items-center justify-between gap-4 min-w-0">
                <Label className="shrink min-w-0 truncate" htmlFor={field.name}>
                  Back (Answer)
                </Label>
                <form.Subscribe selector={(s) => s.values.front}>
                  {(front) => (
                    <SuggestButton
                      isPending={isPendingGenerateBack}
                      disabled={front.trim() === "" || isPendingSuggest}
                      onClick={async () => {
                        const trimmed = front.trim();
                        if (trimmed === "") return;
                        try {
                          const { back } = await mutateGenerateBack({
                            deckId,
                            front: trimmed,
                          });
                          field.handleChange(back);
                        } catch (err) {
                          console.log(err);
                        }
                      }}
                    />
                  )}
                </form.Subscribe>
              </div>
              <FormTextarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                rows={4}
                className="resize-none"
              />
            </FormFieldWrapper>
          )}
        </form.Field>
      </FormWrapper>
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
              {error && (
                <div className="w-[calc(100%+0.5rem)] -mx-1 pb-4">
                  <ErrorCard error={error.message} />
                </div>
              )}
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
        "w-full flex flex-col gap-2 rounded-md border bg-warning/10 border-warning/20 px-2.5 py-1.5",
        className,
      )}
    >
      <p className="w-full text-sm text-warning">
        This card is already in the deck.
      </p>
    </div>
  );
}
