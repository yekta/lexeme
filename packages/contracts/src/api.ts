import { z } from "zod";

import {
  ACCESS_ROLES,
  DEFAULT_ACCESS_ROLE,
  GENERATE_CARD_EXCLUDE_FRONTS_LIMIT,
  deckExportSchema,
} from "@lexeme/shared";

/**
 * The HTTP surface, declared once for both ends.
 *
 * This is what tRPC used to do implicitly by inferring the client from the
 * router type. It is written out here instead, and it is a much smaller thing
 * to write out than it was: reads and writes are Zero synced queries and shared
 * mutators, so all that is left on HTTP is the handful of calls with no local
 * equivalent: the two model calls, which need an API key that must never reach
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

// --- /api/api-keys (session only) ---

export const accessRoleSchema = z.enum(ACCESS_ROLES);

export const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: accessRoleSchema,
  token_prefix: z.string(),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
  last_used_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const listApiKeysResponse = z.object({ keys: z.array(apiKeySchema) });

export const createApiKeyRequest = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  role: accessRoleSchema.default(DEFAULT_ACCESS_ROLE),
  expires_at: z.iso.datetime({ offset: true }).nullable(),
});

/** `token` is the only time the full key leaves the server. */
export const createApiKeyResponse = z.object({
  key: apiKeySchema,
  token: z.string(),
});

export type TApiKey = z.infer<typeof apiKeySchema>;
export type TCreateApiKeyRequest = z.input<typeof createApiKeyRequest>;

// --- /api/connected-apps (session only) ---

export const connectedAppSchema = z.object({
  id: z.uuid(),
  client_name: z.string(),
  role: accessRoleSchema,
  last_used_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const listConnectedAppsResponse = z.object({
  apps: z.array(connectedAppSchema),
});

export type TConnectedApp = z.infer<typeof connectedAppSchema>;

// --- /api/oauth/consent (session only) ---

/** The authorize request's query, forwarded to the consent page unchanged. */
export const oauthAuthorizeParams = z.object({
  response_type: z.string(),
  client_id: z.string(),
  redirect_uri: z.string(),
  code_challenge: z.string(),
  code_challenge_method: z.string(),
  state: z.string().optional(),
  scope: z.string().optional(),
  resource: z.string().optional(),
});

export const oauthConsentResponse = z.object({
  client_name: z.string(),
  redirect_host: z.string(),
});

export const oauthApproveRequest = z.object({
  params: oauthAuthorizeParams,
  role: accessRoleSchema,
});

export const oauthDenyRequest = z.object({ params: oauthAuthorizeParams });

export const oauthRedirectResponse = z.object({ redirect_url: z.string() });

export type TOAuthAuthorizeParams = z.infer<typeof oauthAuthorizeParams>;

/** An empty body, for calls that only answer success. */
export const okResponse = z.object({ ok: z.literal(true) });

// --- /api/devices/pair ---
//
// Pairing an e-reader: the device starts a pairing and shows its code as text
// and a QR code, the signed-in user approves it on the web, and the device's
// poll then receives an API key of its own.

export const startPairingRequest = z.object({
  device_name: z.string().trim().min(1).max(100),
});

export const startPairingResponse = z.object({
  user_code: z.string(),
  /** Secret; only the device has it. Polling with it claims the key. */
  poll_token: z.string(),
  /** Where to approve, with the code filled in: what the QR code encodes. */
  approve_url: z.string(),
  expires_at: z.string(),
  poll_interval_seconds: z.number(),
});

export const pollPairingRequest = z.object({ poll_token: z.string().min(1) });

export const pollPairingResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("pending") }),
  z.object({ status: z.literal("expired") }),
  z.object({
    status: z.literal("approved"),
    /** An API key for the device, shown once. */
    token: z.string(),
    user_name: z.string(),
  }),
]);

/** What the approve page shows before the user confirms (session only). */
export const pairingResponse = z.object({
  device_name: z.string(),
  status: z.enum(["pending", "approved", "expired"]),
});

export type TStartPairingResponse = z.infer<typeof startPairingResponse>;
export type TPollPairingResponse = z.infer<typeof pollPairingResponse>;
export type TPairingResponse = z.infer<typeof pairingResponse>;

// --- /api/books and /api/devices/books ---
//
// Send to Kindle: the web app uploads a book (multipart, field `file`), and the
// device lists what's waiting, downloads each file and marks it delivered. The
// public API and MCP send books through the send-book operation.

export const SENDABLE_BOOK_EXTENSIONS = ["epub", "pdf", "mobi", "azw3", "fb2", "txt", "cbz", "djvu"] as const;
export const MAX_SENT_BOOK_BYTES = 100 * 1024 * 1024;

export const sendBookResponse = z.object({ id: z.string() });

export const deviceBook = z.object({
  id: z.string(),
  title: z.string(),
  file_name: z.string(),
  size_bytes: z.number(),
  sent_at: z.string(),
});

export const deviceBooksResponse = z.object({ books: z.array(deviceBook) });

export type TDeviceBook = z.infer<typeof deviceBook>;
export type TDeviceBooksResponse = z.infer<typeof deviceBooksResponse>;
