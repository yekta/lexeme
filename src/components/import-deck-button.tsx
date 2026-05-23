"use client";

import { ImportDeckForm } from "@/components/import-deck-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastErrorOnOptimisticOperation } from "@/db/toast-on-error";
import { deckExportSchema, type DeckExport } from "@/lib/deck-export";
import { ChevronDown, DownloadIcon, Plus } from "lucide-react";
import { useRef, useState } from "react";

/**
 * Split button for the home page header: primary action creates a deck, the
 * attached chevron opens a menu with "Import Deck" which triggers a hidden file
 * picker. On a valid JSON file the import dialog opens with the parsed payload.
 */
export function CreateOrImportDeckButton({
  isPlaceholder = false,
  onCreate,
  onImported,
}: {
  isPlaceholder?: boolean;
  onCreate: () => void;
  onImported: (id: string) => Promise<void> | void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<DeckExport | null>(null);

  async function handleFile(file: File) {
    let payload: unknown;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch {
      toastErrorOnOptimisticOperation({
        message: "Invalid deck file",
        description: "The selected file is not valid JSON.",
      });
      return;
    }
    const result = deckExportSchema.safeParse(payload);
    if (!result.success) {
      toastErrorOnOptimisticOperation({
        message: "Invalid deck file",
        description: "This file isn't a valid Lexeme deck export.",
      });
      return;
    }
    setParsed(result.data);
  }

  return (
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
      <div className="flex">
        <Button
          isPlaceholder={isPlaceholder}
          onClick={onCreate}
          className="rounded-r-none px-3.5 gap-1"
        >
          <Plus className="size-5 -ml-1.25 shrink-0" />
          <span className="shrink min-w-0 overflow-hidden overflow-ellipsis">
            Create
          </span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                isPlaceholder={isPlaceholder}
                aria-label="More create options"
                className="rounded-l-none border-l-transparent px-1.75"
              />
            }
          >
            <ChevronDown className="size-5 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <DownloadIcon className="size-5 shrink-0" />
              Import Deck
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={parsed !== null}
        onOpenChange={(open) => {
          if (!open) setParsed(null);
        }}
      >
        <DialogContent>
          {parsed && (
            <ImportDeckForm
              parsed={parsed}
              onAfterSubmit={async (id) => {
                setParsed(null);
                await onImported(id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
