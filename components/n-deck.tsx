"use client";

import BgPattern from "@/components/bg-pattern";
import { LearningProfileField } from "@/components/learning-profile-field";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDeleteDeck,
  useUpdateDeck,
  type TDeck,
} from "@/hooks/data/use-decks";
import { useLearningProfiles } from "@/hooks/data/use-learning-profiles";
import { useForm } from "@tanstack/react-form";
import { MoreVertical, Settings, Trash2 } from "lucide-react";
import { motion } from "motion/react";
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

type TNDeckProps =
  | { isPlaceholder: true }
  | {
      isPlaceholder?: never;
      deck: TDeck;
      totalCards: number;
      newCount: number;
      learningCount: number;
      dueCount: number;
      isRecentlyUpdated: boolean;
      studyHref: string;
      manageHref: string;
    };

export function NDeck(props: TNDeckProps) {
  const { isPlaceholder } = props;

  const name = isPlaceholder ? "Deck Name" : props.deck.name;
  const description = isPlaceholder
    ? "A short description"
    : props.deck.description;
  const totalCards = isPlaceholder ? 0 : props.totalCards;
  const newCount = isPlaceholder ? 0 : props.newCount;
  const learningCount = isPlaceholder ? 0 : props.learningCount;
  const dueCount = isPlaceholder ? 0 : props.dueCount;
  const isRecentlyUpdated = isPlaceholder ? false : props.isRecentlyUpdated;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      className="group relative"
      data-placeholder={isPlaceholder || undefined}
    >
      {/* Ghost card 2 — bottom of stack */}
      {(isPlaceholder || totalCards > 2) && (
        <div className="shadow-md shadow-shadow/shadow absolute -top-2.5 -left-0.5 w-full h-full rounded-xl border border-border bg-card -rotate-[1deg] origin-bottom-left" />
      )}
      {/* Ghost card 1 */}
      {(isPlaceholder || totalCards > 1) && (
        <div className="shadow-md shadow-shadow/shadow absolute -top-1 left-2.5 w-full h-full rounded-xl border border-border bg-card -rotate-[1deg] origin-bottom-left" />
      )}
      {/* Main card */}
      <motion.div className="relative z-10">
        <Card className="flex flex-col shadow-md shadow-shadow/shadow relative">
          {!isPlaceholder && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="inline-flex absolute right-1 top-1 items-center justify-center rounded-lg text-sm font-medium hover:bg-accent size-9 shrink-0 focus-visible:outline-none group-data-placeholder:pointer-events-none group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:text-transparent"
                    >
                      <MoreVertical className="size-5 text-muted-foreground group-data-placeholder:opacity-0" />
                    </Button>
                  }
                ></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-40">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings className="size-5" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-5" />
                    Delete Deck
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogContent>
                  <DeckSettingsForm
                    deck={props.deck}
                    onDone={() => setSettingsOpen(false)}
                  />
                </DialogContent>
              </Dialog>

              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                  <DeleteDeckForm
                    deck={props.deck}
                    onDone={() => setDeleteOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="w-full flex flex-col items-start gap-1">
              <CardTitle className="truncate pr-5 group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                {name}
              </CardTitle>
              <CardDescription className="truncate group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                {description}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="flex flex-col items-start gap-3 mt-2">
              <div
                data-updated={isRecentlyUpdated ? "true" : undefined}
                className="text-sm max-w-full text-muted-foreground bg-transparent flex justify-start transition-colors duration-300 rounded px-2 py-0.5 -ml-2 data-updated:bg-success-muted data-updated:text-success-foreground"
              >
                <p className="max-w-full min-w-0 group-data-placeholder:text-transparent group-data-placeholder:rounded group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:select-none">
                  {totalCards} {totalCards === 1 ? "card" : "cards"}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-state-new group-data-placeholder:text-transparent group-data-placeholder:bg-state-new/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-new group-data-placeholder:opacity-0" />
                  {newCount} New
                </div>
                <div className="flex items-center gap-1.5 text-state-learn group-data-placeholder:text-transparent group-data-placeholder:bg-state-learn/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-learn group-data-placeholder:opacity-0" />
                  {learningCount} Learn
                </div>
                <div className="flex items-center gap-1.5 text-state-due group-data-placeholder:text-transparent group-data-placeholder:bg-state-due/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
                  <span className="w-2 h-2 rounded-full bg-state-due group-data-placeholder:opacity-0" />
                  {dueCount} Due
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col w-full gap-1 relative">
            <LinkButton
              href={isPlaceholder ? "#" : props.studyHref}
              isPlaceholder={isPlaceholder}
              className="w-full"
            >
              Study
            </LinkButton>
            <LinkButton
              variant="outline"
              href={isPlaceholder ? "#" : props.manageHref}
              isPlaceholder={isPlaceholder}
              className="w-full"
            >
              Manage
            </LinkButton>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

function DeckSettingsForm({
  deck,
  onDone,
}: {
  deck: TDeck;
  onDone: () => void;
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
      onDone();
    },
  });

  const isLoading = isPendingProfiles || !profiles;

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
              <Input
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
              <Label htmlFor={field.name}>Description (optional)</Label>
              <Input
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
              isLoading={isLoading}
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
              disabled={!canSubmit || !isDirty || isLoading}
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

function DeleteDeckForm({ deck, onDone }: { deck: TDeck; onDone: () => void }) {
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
