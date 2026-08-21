import { deckExportResponse } from "@lexeme/contracts";
import { deckExportFilename } from "@lexeme/shared";
import { useMutation } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import { toastErrorOnOptimisticOperation } from "@/components/mutation-error-toast";

/**
 * Download a deck as a portable file.
 *
 * A server call rather than a read of the synced rows, because the export is a
 * different artefact from what the app holds: no ids, no FSRS state, no
 * learning-profile reference, so a re-import starts fresh and the importer picks
 * their own profile.
 *
 * The failure path is a toast rather than an inline error because by the time
 * one arrives the menu that started this has usually closed.
 */
export function useExportDeck() {
  return useMutation({
    mutationKey: ["decks", "export"],
    mutationFn: (deckId: string) =>
      apiGet(`/api/decks/${deckId}/export`, deckExportResponse),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = deckExportFilename(payload.deck.name);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      toastErrorOnOptimisticOperation({
        message: "Failed to export deck",
        description: error instanceof Error ? error.message : "Please try again.",
      });
    },
  });
}
