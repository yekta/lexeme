"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCardsByDeck, useImportCards } from "@/hooks/data/use-cards";
import { appLocale } from "@/lib/constants";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";

const normalizeFront = (front: string) => front.trim().toLowerCase();

const pluralize = (count: number) => (count === 1 ? "card" : "cards");

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
  const { data: existingCards } = useCardsByDeck(deckId);

  // Snapshot the existing fronts once, on mount. The form remounts each time the
  // dialog opens, so this is always current when shown — same approach as
  // AddCardForm.
  const [existingFronts] = useState(
    () => new Set(existingCards.map((c) => normalizeFront(c.front))),
  );

  // Split the batch into unique vs duplicate. A card is a duplicate if its front
  // matches one already in the deck, or an earlier card in this same batch
  // (first occurrence wins).
  const { uniqueCards, duplicateCards } = useMemo(() => {
    const seen = new Set(existingFronts);
    const unique: typeof cards = [];
    const duplicates: typeof cards = [];
    for (const card of cards) {
      const key = normalizeFront(card.front);
      if (seen.has(key)) {
        duplicates.push(card);
      } else {
        seen.add(key);
        unique.push(card);
      }
    }
    return { uniqueCards: unique, duplicateCards: duplicates };
  }, [cards, existingFronts]);

  const hasDuplicates = duplicateCards.length > 0;

  const form = useForm({
    defaultValues: { importDuplicates: false },
    onSubmit: async ({ value }) => {
      const cardsToImport = value.importDuplicates ? cards : uniqueCards;
      importCards.mutate({ deckId, cards: cardsToImport });
      await onAfterSubmit();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="w-full flex flex-col"
    >
      <DialogHeader>
        <DialogTitle>Import Cards</DialogTitle>
        <DialogDescription className="w-full flex flex-col">
          <p className="leading-tight mt-1">Found:</p>
          <p className="font-medium text-foreground text-base">
            {cards.length} {pluralize(cards.length)}
          </p>
          {hasDuplicates && (
            <>
              <p className="mt-2.5 leading-tight">Duplicates:</p>
              <p className="font-medium text-warning text-base">
                {duplicateCards.length} {pluralize(duplicateCards.length)}
              </p>
              <p className="mt-2.5 leading-tight">Unique:</p>
              <p className="font-medium text-foreground text-base">
                {uniqueCards.length} {pluralize(uniqueCards.length)}
              </p>
            </>
          )}
          <p className="mt-2.5 leading-tight">Importing into:</p>
          <p className="font-medium text-foreground text-base">{deckName}</p>
        </DialogDescription>
      </DialogHeader>
      {hasDuplicates && (
        <form.Field name="importDuplicates">
          {(field) => (
            <div className="max-w-full pt-4 pb-1 flex items-center gap-2">
              <Label
                htmlFor="import-duplicates"
                className="cursor-pointer text-warning flex shrink min-w-0 hover:bg-warning/10 active:bg-warning/10 px-2 py-2 rounded-md -mx-2 -my-2 max-w-[calc(100%+1rem)]"
              >
                <Checkbox
                  id="import-duplicates"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                  className="border-warning data-checked:bg-warning data-checked:border-warning"
                />
                <span className="shrink min-w-0 wrap-anywhere font-normal">
                  Import duplicate cards as well
                </span>
              </Label>
            </div>
          )}
        </form.Field>
      )}
      <div className="h-4" />
      <DialogFooter>
        <form.Subscribe
          selector={(s) => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
            importDuplicates: s.values.importDuplicates,
          })}
        >
          {({ canSubmit, isSubmitting, importDuplicates }) => {
            const importCount = (importDuplicates ? cards : uniqueCards).length;
            return (
              <Button
                type="submit"
                disabled={!canSubmit || importCount === 0}
                isPending={isSubmitting}
              >
                Import {importCount.toLocaleString(appLocale)}{" "}
                {pluralize(importCount)}
              </Button>
            );
          }}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
}
