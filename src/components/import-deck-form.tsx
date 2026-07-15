"use client";

import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { LearningProfileField } from "@/components/learning-profile-field";
import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImportDeck } from "@/hooks/data/use-import-deck";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { type DeckExport } from "@/lib/deck-export";
import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import { z } from "zod";

const importDeckSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim(),
  learning_profile_id: z.uuid(),
});

export function ImportDeckForm({
  parsed,
  onAfterSubmit,
}: {
  parsed: DeckExport;
  onAfterSubmit: (id: string) => Promise<void> | void;
}) {
  const { data: profiles, isPending: isPendingProfiles } =
    useLearningProfiles();
  const defaultProfile = profiles?.find((p) => p.is_default);
  const defaultProfileId = defaultProfile?.id;
  const importDeck = useImportDeck();

  const cardCount = parsed.cards.length;
  const cardWord = cardCount === 1 ? "card" : "cards";

  const form = useForm({
    defaultValues: {
      name: parsed.deck.name,
      description: parsed.deck.description,
      learning_profile_id: defaultProfileId ?? "",
    },
    validators: {
      onMount: importDeckSchema,
      onChange: importDeckSchema,
      onSubmit: importDeckSchema,
    },
    onSubmit: async ({ value }) => {
      const deckId = importDeck.mutate({
        name: value.name,
        description: value.description,
        learning_profile_id: value.learning_profile_id,
        cards: parsed.cards,
      });
      await onAfterSubmit(deckId);
    },
  });

  useEffect(() => {
    if (!defaultProfileId) return;
    if (form.getFieldValue("learning_profile_id")) return;
    form.setFieldValue("learning_profile_id", defaultProfileId);
    void form.validate("change");
  }, [defaultProfileId, form]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Import Deck</DialogTitle>
        <DialogDescription>
          Adjust the name, description, or learning profile.
        </DialogDescription>
      </DialogHeader>
      <FormWrapper>
        <div className="w-full flex flex-col gap-0.5">
          <p className="text-muted-foreground w-full leading-tight">Found:</p>
          <p className="text-base font-medium w-full">
            {cardCount} {cardWord}
          </p>
        </div>
        <form.Field name="name">
          {(field) => (
            <FormFieldWrapper>
              <Label htmlFor={field.name}>Name</Label>
              <FormInput
                id={field.name}
                name={field.name}
                placeholder="e.g. Spanish Vocabulary"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormFieldWrapper>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <FormFieldWrapper>
              <Label htmlFor={field.name}>
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <FormInput
                id={field.name}
                name={field.name}
                placeholder="e.g. Words from chapter 1-5"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </FormFieldWrapper>
          )}
        </form.Field>
        <form.Field name="learning_profile_id">
          {(field) => (
            <LearningProfileField
              profiles={profiles}
              isPending={isPendingProfiles}
              value={field.state.value}
              onChange={field.handleChange}
              fallbackId={defaultProfile?.id}
            />
          )}
        </form.Field>
      </FormWrapper>
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
              disabled={!canSubmit || isPendingProfiles}
              isPending={isSubmitting}
            >
              Import Deck
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
