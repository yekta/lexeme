"use client";

import BgPattern from "@/components/bg-pattern";
import { useNow } from "@/components/now-provider";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteCard, useUpdateCard } from "@/hooks/data/use-cards";
import { useForm } from "@tanstack/react-form";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

const cardSchema = z.object({
  front: z.string().trim().min(1, "Front is required"),
  back: z.string().trim().min(1, "Back is required"),
});

type TNCardManageProps =
  | { isPlaceholder: true }
  | {
      isPlaceholder?: never;
      id: string;
      deckId: string;
      front: string;
      back: string;
      createdAt: string;
    };

export function NCardManage(props: TNCardManageProps) {
  const { isPlaceholder } = props;

  const front = isPlaceholder ? "This is the front of the card" : props.front;
  const back = isPlaceholder ? "This is the back of the card" : props.back;

  const now = useNow();
  const isNew =
    !isPlaceholder &&
    now - new Date(props.createdAt).getTime() < 4000 &&
    now - new Date(props.createdAt).getTime() >= 500;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div
      className="group relative rounded-xl border flex flex-col border-border bg-background shadow-md shadow-shadow/[var(--opacity-shadow)] overflow-hidden isolate transition-colors"
      data-placeholder={isPlaceholder || undefined}
      style={{
        boxShadow: "0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)",
      }}
    >
      {/* Menu */}
      <div className="absolute top-1 right-1 z-10">
        {isPlaceholder && (
          <Button variant="ghost" isPlaceholder={true} className="size-9">
            <MoreVertical className="size-5 text-muted-foreground" />
          </Button>
        )}
        {!isPlaceholder && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="size-9">
                  <MoreVertical className="size-5 text-muted-foreground" />
                </Button>
              }
            ></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
                Edit Card
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete Card
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!isPlaceholder && (
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <EditCardForm
                id={props.id}
                deckId={props.deckId}
                front={props.front}
                back={props.back}
                onDone={() => setEditOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}

        {!isPlaceholder && (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogContent>
              <DeleteCardForm
                id={props.id}
                deckId={props.deckId}
                onDone={() => setDeleteOpen(false)}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
      {/* Front */}
      <div className="px-5 py-4 flex-1 w-full flex flex-col items-start relative bg-card gap-2">
        {/* New Card Indicator Start */}
        <div
          data-new={isNew || undefined}
          className="h-full pointer-events-none opacity-0 data-new:opacity-100 transition duration-500 rounded-tl-[calc(var(--radius)*1.4-1px)] aspect-square absolute top-0 left-0 bg-gradient-to-br dark:from-new-item/70 from-new-item via-new-item/0 to-new-item/0 pl-px pt-px"
        >
          <div className="w-full h-full bg-card rounded-tl-[calc(var(--radius)*1.4-2px)]" />
        </div>
        <div
          data-new={isNew || undefined}
          className="h-4/5 aspect-square bg-new-item/60 dark:bg-new-item/40 absolute left-0 top-0 blur-2xl -translate-x-[200%] -translate-y-[200%] data-new:translate-[-25%] transition duration-500 pointer-events-none"
        />
        {/* New Card Indicator End */}
        <p className="shrink max-w-full relative pr-5 min-w-0 overflow-hidden overflow-ellipsis text-xs font-semibold uppercase tracking-wider text-muted-foreground group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:w-10 group-data-placeholder:select-none">
          Front
        </p>
        <p className="shrink relative max-w-full min-w-0 text-sm text-foreground line-clamp-3 break-words font-medium leading-relaxed group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {front}
        </p>
      </div>

      {/* Divider — ruled line style */}
      <div className="w-full h-px bg-border relative z-10" />

      {/* Back */}
      <div className="px-5 py-4 relative w-full flex flex-col items-start gap-2">
        <BgPattern />
        <p className="relative shrink max-w-full pr-5 min-w-0 overflow-hidden overflow-ellipsis text-xs font-semibold uppercase tracking-wider text-muted-foreground group-data-placeholder:text-transparent group-data-placeholder:bg-muted-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:w-10 group-data-placeholder:select-none">
          Back
        </p>
        <p className="relative shrink max-w-full min-w-0 text-sm text-foreground line-clamp-3 break-words leading-relaxed group-data-placeholder:text-transparent group-data-placeholder:bg-foreground/20 group-data-placeholder:animate-pulse group-data-placeholder:rounded group-data-placeholder:select-none">
          {back}
        </p>
      </div>
    </div>
  );
}

function EditCardForm({
  id,
  deckId,
  front,
  back,
  onDone,
}: {
  id: string;
  deckId: string;
  front: string;
  back: string;
  onDone: () => void;
}) {
  const mutation = useUpdateCard();
  const form = useForm({
    defaultValues: { front, back },
    validators: {
      onMount: cardSchema,
      onChange: cardSchema,
      onSubmit: cardSchema,
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({
        id,
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
        <DialogTitle>Edit Card</DialogTitle>
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
              disabled={!canSubmit || !isDirty}
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

function DeleteCardForm({
  id,
  deckId,
  onDone,
}: {
  id: string;
  deckId: string;
  onDone: () => void;
}) {
  const mutation = useDeleteCard();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete Card</DialogTitle>
        <DialogDescription>
          Are you sure you want to delete this card? This action cannot be
          undone.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          isPending={mutation.isPending}
          onClick={() => {
            mutation.mutate({ id, deckId }, { onSuccess: onDone });
          }}
        >
          Delete
        </Button>
      </DialogFooter>
    </>
  );
}
