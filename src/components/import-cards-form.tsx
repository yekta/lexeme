"use client";

import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useImportCards } from "@/hooks/data/use-cards";
import { useForm } from "@tanstack/react-form";

export function ImportCardsForm({
  deckId,
  deckName,
  cards,
  onAfterSubmit,
}: {
  deckId: string;
  deckName: string;
  cards: { front: string; back: string }[];
  onAfterSubmit: () => Promise<void> | void;
}) {
  const importCards = useImportCards();
  const cardCount = cards.length;
  const cardWord = cardCount === 1 ? "card" : "cards";

  const form = useForm({
    defaultValues: {},
    onSubmit: async () => {
      importCards.mutate({ deckId, cards });
      await onAfterSubmit();
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
        <DialogTitle>Import Cards</DialogTitle>
        <DialogDescription className="w-full flex flex-col">
          <p className="leading-tight mt-1">Found:</p>
          <p className="font-medium text-foreground text-base">
            {cardCount} {cardWord}
          </p>
          <p className="mt-2.5 leading-tight">Importing into:</p>
          <p className="font-medium text-foreground text-base">{deckName}</p>
        </DialogDescription>
      </DialogHeader>
      <div className="h-4" />
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
              Import Cards
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
