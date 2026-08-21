import { z } from "zod";

import { GENERATE_CARD_EXCLUDE_FRONTS_LIMIT, deckExportSchema } from "@lexeme/shared";

/**
 * The HTTP surface, declared once for both ends.
 *
 * This is what tRPC used to do implicitly by inferring the client from the
 * router type. It is written out here instead, and it is a much smaller thing
 * to write out than it was: reads and writes are Zero synced queries and shared
 * mutators, so all that is left on HTTP is the handful of calls with no local
 * equivalent — the two model calls, which need an API key that must never reach
 * a browser, and the export snapshot, which is a server-rendered artefact
 * rather than a view of the synced rows.
 *
 * Each endpoint declares its request and response schema. The Hono handlers
 * parse requests with these, and the browser parses responses with them, so a
 * server that starts answering a different shape is caught at the boundary
 * rather than three components deep.
 */

/**
 * A settled, non-retryable answer, named so the client can tell "this deck does
 * not exist" from "the network coughed".
 *
 * The names are tRPC's, deliberately: `lib/query-state.ts` in the web app
 * classifies data states by these strings, and keeping them means the screens
 * that already distinguish not-found from forbidden did not have to change when
 * the transport did.
 */
export const API_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "INTERNAL_SERVER_ERROR",
] as const;

export type TApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  }),
});

export type TApiError = z.infer<typeof apiErrorSchema>;

/** HTTP status for each code, so the handler and the client agree on the mapping. */
export const API_ERROR_STATUS: Record<TApiErrorCode, 400 | 401 | 403 | 404 | 412 | 500> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PRECONDITION_FAILED: 412,
  INTERNAL_SERVER_ERROR: 500,
};

// --- GET /api/decks/:id/export ---

/**
 * The portable deck snapshot. Defined in `@lexeme/shared` because the importer
 * validates a file the user picked with the same schema the server produces.
 */
export const deckExportResponse = deckExportSchema;

// --- POST /api/cards/generate-back ---

export const generateBackRequest = z.object({
  deckId: z.uuid(),
  front: z.string().trim().min(1),
});

export const generateBackResponse = z.object({ back: z.string().min(1) });

export type TGenerateBackRequest = z.infer<typeof generateBackRequest>;
export type TGenerateBackResponse = z.infer<typeof generateBackResponse>;

// --- POST /api/cards/generate-card ---

export const generateCardRequest = z.object({
  deckId: z.uuid(),
  /**
   * Fronts this session already offered and the user passed on, so the next
   * suggestion is not the same one again. Capped at the same number the client
   * keeps, so an oversized list is a bad request rather than an unbounded prompt.
   */
  excludeFronts: z
    .array(z.string().trim().min(1))
    .max(GENERATE_CARD_EXCLUDE_FRONTS_LIMIT)
    .optional(),
});

export const generateCardResponse = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
});

export type TGenerateCardRequest = z.infer<typeof generateCardRequest>;
export type TGenerateCardResponse = z.infer<typeof generateCardResponse>;
