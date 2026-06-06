"use client";

import { ImportCardsForm } from "@/components/import-cards-form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toastErrorOnOptimisticOperation } from "@/db/toast-on-error";
import { cardsImportSchema } from "@/lib/cards-import";
import { useRef, useState } from "react";

/**
 * Shared "import cards into a deck" flow: a hidden file picker that parses a
 * JSON file (either a Lexeme deck export or a bare `[{front, back}, ...]` array)
 * and, on success, opens a confirmation dialog wrapping {@link ImportCardsForm}.
 *
 * Returns `openFilePicker` to trigger the file dialog (e.g. from a menu item)
 * and `importElements` to render once in the consumer's tree.
 */
export function useImportCardsFlow({
  deckId,
  deckName,
}: {
  deckId: string;
  deckName: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  // `parsedCards` deliberately persists through the dialog's close animation —
  // unmounting the form synchronously on submit leaves an empty dialog visible
  // for a frame. Reopening with a new file overwrites it.
  const [parsedCards, setParsedCards] = useState<
    { front: string; back: string }[] | null
  >(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

  async function handleFile(file: File) {
    let payload: unknown;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch {
      toastErrorOnOptimisticOperation({
        message: "Invalid card file",
        description: "The selected file is not valid JSON.",
      });
      return;
    }
    const result = cardsImportSchema.safeParse(payload);
    if (!result.success) {
      toastErrorOnOptimisticOperation({
        message: "Invalid card file",
        description:
          "Expected a Lexeme deck export or an array of {front, back} cards.",
      });
      return;
    }
    setParsedCards(result.data);
    setIsImportOpen(true);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  const importElements = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset value so picking the same file twice still fires onChange.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent>
          {parsedCards && (
            <ImportCardsForm
              deckId={deckId}
              deckName={deckName}
              cards={parsedCards}
              onAfterSubmit={() => setIsImportOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  return { openFilePicker, importElements };
}
