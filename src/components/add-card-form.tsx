"use client";

import { Button } from "@/components/ui/button";
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateCard } from "@/hooks/data/use-cards";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";

const cardSchema = z.object({
  front: z.string().trim().min(1, "Front is required"),
  back: z.string().trim().min(1, "Back is required"),
});

export function AddCardForm({
  deckId,
  onDone,
}: {
  deckId: string;
  onDone: () => void;
}) {
  const mutation = useCreateCard();
  const form = useForm({
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
      </DialogHeader>
      <div className="space-y-4 py-4">
        <form.Field name="front">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Front (Question)</Label>
              <Input
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
              <Input
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
      <DialogFooter>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
          })}
        >
          {({ canSubmit, isSubmitting }) => (
            <Button
              type="submit"
              disabled={!canSubmit}
              isPending={isSubmitting}
            >
              Add Card
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
