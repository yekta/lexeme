import { z } from "zod";

export const DECK_EXPORT_VERSION = 1;
export const DECK_EXPORT_KIND = "lexeme-deck";

export const deckExportSchema = z.object({
  version: z.literal(DECK_EXPORT_VERSION),
  kind: z.literal(DECK_EXPORT_KIND),
  deck: z.object({
    name: z.string().trim().min(1),
    description: z.string(),
  }),
  cards: z.array(
    z.object({
      front: z.string().trim().min(1),
      back: z.string().trim().min(1),
    }),
  ),
});

export type DeckExport = z.infer<typeof deckExportSchema>;

/** Filename slug for a deck export — lowercase, alnum + hyphen, length-capped. */
export function deckExportFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "deck"}.lexeme.json`;
}
