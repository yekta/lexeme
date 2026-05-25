import { z } from "zod";

import { deckExportSchema } from "@/lib/deck-export";

const minimalCardSchema = z.object({
  front: z.string().trim().min(1),
  back: z.string().trim().min(1),
});

/**
 * Accepts either a full Lexeme deck export (we pull just its cards) or a bare
 * `[{front, back}, ...]` array. Both shapes normalize to a non-empty list of
 * `{front, back}` so the import flow only ever sees one type.
 */
export const cardsImportSchema = z
  .union([deckExportSchema, z.array(minimalCardSchema)])
  .transform((v) => (Array.isArray(v) ? v : v.cards))
  .pipe(z.array(minimalCardSchema).min(1));

export type CardsImport = z.infer<typeof cardsImportSchema>;
