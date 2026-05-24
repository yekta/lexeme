"use client";

import { LearningProfileField } from "@/components/learning-profile-field";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormInput, Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastErrorOnOptimisticOperation } from "@/db/toast-on-error";
import { useDeleteDeck, useUpdateDeck } from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { deckExportFilename } from "@/lib/deck-export";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/vanilla";
import { useForm } from "@tanstack/react-form";
import { MoreVertical, Settings, Trash2, UploadIcon } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

const DELETE_DECK_CONFIRMATION = "I want to delete this deck";

const deckSettingsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim(),
  learning_profile_id: z.uuid(),
});

const deleteDeckSchema = z.object({
  confirmation: z
    .string()
    .refine(
      (v) => v === DELETE_DECK_CONFIRMATION,
      "Confirmation text does not match",
    ),
});

/** The deck fields the settings menu needs — satisfied by both the deck list
 * row (`TDeck`) and the single-deck summary (`TDeckSummary`). */
export type TDeckSettingsMenuDeck = {
  id: string;
  name: string;
  description: string | null;
  learning_profile_id: string;
};

export function DeckSettingsMenu({
  deck,
  triggerClassName,
  align = "end",
  onDeleted,
}: {
  deck: TDeckSettingsMenuDeck;
  /** Extra classes for the trigger button (e.g. absolute positioning). */
  triggerClassName?: string;
  /** Which edge the dropdown aligns to relative to the trigger. */
  align?: React.ComponentProps<typeof DropdownMenuContent>["align"];
  /** Called after the deck is successfully deleted (e.g. to redirect away). */
  onDeleted?: () => void;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSettingsFormOpen, setIsSettingsFormOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const payload = await trpc.decks.export.query({ id: deck.id });
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = deckExportFilename(payload.deck.name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "Please try again.";
      toastErrorOnOptimisticOperation({
        message: "Failed to export deck",
        description,
      });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className={cn(triggerClassName)}
            >
              <MoreVertical className="size-5 shrink-0 text-muted-foreground group-data-popup-open/button:rotate-90 transition" />
            </Button>
          }
        ></DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-40">
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => setIsSettingsFormOpen(true)}
          >
            <Settings className="size-5 shrink-0" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer"
            disabled={isExporting}
            onClick={handleExport}
          >
            <UploadIcon className="size-5 shrink-0" />
            Export Deck
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="size-5 shrink-0" />
            Delete Deck
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isSettingsFormOpen} onOpenChange={setIsSettingsFormOpen}>
        <DialogContent>
          <DeckSettingsForm
            deck={deck}
            onDone={() => setIsSettingsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DeleteDeckForm
            deck={deck}
            onDeleted={onDeleted}
            onDone={() => setIsDeleteOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeckSettingsForm({
  deck,
  onDone,
}: {
  deck: TDeckSettingsMenuDeck;
  onDone: () => void | Promise<void>;
}) {
  const { data: profiles, isPending: isPendingProfiles } =
    useLearningProfiles();
  const mutation = useUpdateDeck();
  const form = useForm({
    defaultValues: {
      name: deck.name,
      description: deck.description ?? "",
      learning_profile_id: deck.learning_profile_id,
    },
    validators: {
      onMount: deckSettingsSchema,
      onChange: deckSettingsSchema,
      onSubmit: deckSettingsSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        id: deck.id,
        name: value.name,
        description: value.description,
        learning_profile_id: value.learning_profile_id,
      });
      await onDone();
    },
  });

  const isPending = isPendingProfiles || !profiles;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>
          Update the name, description, or learning profile for this deck.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <form.Field name="name">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Name</Label>
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Deck Name"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="e.g. Words from chapter 1-5"
              />
            </div>
          )}
        </form.Field>
        <form.Field name="learning_profile_id">
          {(field) => (
            <LearningProfileField
              profiles={profiles}
              isPending={isPending}
              value={field.state.value}
              onChange={field.handleChange}
              fallbackId={
                profiles?.find((p) => p.is_default)?.id ??
                deck.learning_profile_id
              }
            />
          )}
        </form.Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
            isDirty: s.isDirty,
          })}
        >
          {({ canSubmit, isSubmitting, isDirty }) => (
            <Button
              type="submit"
              disabled={!canSubmit || !isDirty || isPending}
              isPending={isSubmitting}
            >
              Save
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}

function DeleteDeckForm({
  deck,
  onDeleted,
  onDone,
}: {
  deck: TDeckSettingsMenuDeck;
  onDeleted?: () => void;
  onDone: () => void | Promise<void>;
}) {
  const mutation = useDeleteDeck();
  const form = useForm({
    defaultValues: { confirmation: "" },
    validators: {
      onMount: deleteDeckSchema,
      onChange: deleteDeckSchema,
      onSubmit: deleteDeckSchema,
    },
    onSubmit: async () => {
      await mutation.mutateAsync({ id: deck.id });
      onDeleted?.();
      await onDone();
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
        <DialogTitle>Delete Deck</DialogTitle>
        <DialogDescription>
          This action cannot be undone. This will permanently delete the deck
          &quot;{deck.name}&quot; and all its cards.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-2">
            Please type{" "}
            <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-mono font-medium">
              {DELETE_DECK_CONFIRMATION}
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
                placeholder={DELETE_DECK_CONFIRMATION}
              />
            )}
          </form.Field>
        </div>
      </div>
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
              Delete
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
