"use client";

import PlusIcon from "@/components/icons/plus-icon";
import { ImportCardsForm } from "@/components/import-cards-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastErrorOnOptimisticOperation } from "@/db/toast-on-error";
import { cardsImportSchema } from "@/lib/cards-import";
import { ChevronDown, DownloadIcon } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Split button for the deck-detail header: primary action opens the single-card
 * form, the attached chevron opens a menu with "Import Cards" which triggers a
 * hidden file picker. On a valid JSON file (either a Lexeme deck export or a
 * bare `[{front, back}, ...]` array) the import dialog opens with the parsed
 * cards.
 */
export function AddOrImportCardsButton({
  isPlaceholder = false,
  deckId,
  deckName,
  onAdd,
}: {
  isPlaceholder?: boolean;
  deckId: string;
  deckName: string;
  onAdd: () => void;
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          setIsDropdownOpen(false);
          const file = e.target.files?.[0];
          // Reset value so picking the same file twice still fires onChange.
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <div className="flex">
        <Button
          isPlaceholder={isPlaceholder}
          onClick={onAdd}
          className="rounded-r-none px-3.5"
        >
          <PlusIcon className="size-5 -ml-1.25 shrink-0" />
          <span className="shrink min-w-0 overflow-hidden text-ellipsis">
            Add Card
          </span>
        </Button>
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                isPlaceholder={isPlaceholder}
                aria-label="More add options"
                className="rounded-l-none border-l-transparent px-1.75"
              />
            }
          >
            <ChevronDown className="size-5 shrink-0 group-data-popup-open/button:rotate-180 transition" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              closeOnClick={false}
            >
              <DownloadIcon className="size-5 shrink-0" />
              Import Cards
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
}
