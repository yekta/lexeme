import ErrorCard from "@/components/error-card";
import { FormFieldWrapper, FormWrapper } from "@/components/form";
import { SuggestButton } from "@/components/suggest-button";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormTextarea } from "@/components/ui/textarea";
import { useGenerateBack } from "@/hooks/data/use-ai";
import { useCreateCard } from "@/hooks/data/use-cards";
import { useDecks } from "@/hooks/data/use-decks";
import type { TLookup } from "@/hooks/data/use-reading";
import { useMemo, useState } from "react";

const LAST_DECK_KEY = "lexeme:word-card-deck";

/** The add-card form for a looked-up word: its front filled in, and a deck to pick. */
export function WordCardForm({ lookup, onDone }: { lookup: TLookup; onDone: () => void }) {
  const { data: decks, isPending: isPendingDecks } = useDecks();
  const [chosenDeckId, setChosenDeckId] = useState(() => localStorage.getItem(LAST_DECK_KEY) ?? "");
  const deck = decks.find((d) => d.id === chosenDeckId) ?? decks[0];
  const [front, setFront] = useState(lookup.headword ?? lookup.word);
  const [back, setBack] = useState("");
  const generateBack = useGenerateBack();
  const createCard = useCreateCard();

  const deckOptions = useMemo(() => decks.map((d) => ({ value: d.id, label: d.name })), [decks]);
  const selected = deckOptions.find((o) => o.value === deck?.id) ?? null;

  const suggestBack = (deckId: string) => {
    const trimmed = front.trim();
    if (!trimmed) return;
    generateBack.mutate({ deckId, front: trimmed }, { onSuccess: (result) => setBack(result.back) });
  };

  const canSubmit = Boolean(deck) && front.trim() !== "" && back.trim() !== "";

  return (
    <form
      className="min-w-0"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!deck || !canSubmit) return;
        await createCard.mutateAsync({ deckId: deck.id, front: front.trim(), back: back.trim() });
        localStorage.setItem(LAST_DECK_KEY, deck.id);
        onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add Card</DialogTitle>
        <DialogDescription>Add the word to a deck.</DialogDescription>
      </DialogHeader>
      <FormWrapper className="min-w-0">
        <FormFieldWrapper>
          <Label>Deck</Label>
          <Combobox
            isPlaceholder={isPendingDecks}
            isPlaceholderText="Deck"
            items={deckOptions}
            itemToStringValue={(item) => item.label}
            value={selected}
            onValueChange={(item) => {
              if (item) setChosenDeckId(item.value);
            }}
          >
            <ComboboxInput placeholder="Search decks..." className="-mx-1 w-[calc(100%+0.5rem)]" />
            <ComboboxContent>
              <ComboboxEmpty>No decks found.</ComboboxEmpty>
              <ComboboxList>
                {(item: (typeof deckOptions)[number]) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </FormFieldWrapper>
        <FormFieldWrapper>
          <Label htmlFor="word-card-front">Front (Question)</Label>
          <FormInput
            id="word-card-front"
            autoCapitalize="none"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
        </FormFieldWrapper>
        <FormFieldWrapper className="min-w-0">
          <div className="w-full flex items-center justify-between gap-4 min-w-0">
            <Label htmlFor="word-card-back" className="shrink min-w-0 truncate">
              Back (Answer)
            </Label>
            {deck && (
              <SuggestButton
                isPending={generateBack.isPending}
                disabled={front.trim() === ""}
                onClick={() => suggestBack(deck.id)}
              />
            )}
          </div>
          <FormTextarea
            id="word-card-back"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </FormFieldWrapper>
      </FormWrapper>
      {!isPendingDecks && decks.length === 0 && (
        <div className="w-[calc(100%+0.5rem)] -mx-1 pb-4">
          <ErrorCard error="Create a deck first." />
        </div>
      )}
      {generateBack.error && (
        <div className="w-[calc(100%+0.5rem)] -mx-1 pb-4">
          <ErrorCard error={generateBack.error.message} />
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={!canSubmit}>
          Add Card
        </Button>
      </DialogFooter>
    </form>
  );
}
