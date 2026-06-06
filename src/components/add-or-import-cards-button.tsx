"use client";

import PlusIcon from "@/components/icons/plus-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImportCardsFlow } from "@/hooks/use-import-cards-flow";
import { ChevronDown, DownloadIcon } from "lucide-react";
import { useState } from "react";

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
  const { openFilePicker, importElements } = useImportCardsFlow({
    deckId,
    deckName,
  });

  return (
    <>
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
              onClick={() => {
                setIsDropdownOpen(false);
                openFilePicker();
              }}
              closeOnClick={false}
            >
              <DownloadIcon className="size-5 shrink-0" />
              Import Cards
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {importElements}
    </>
  );
}
