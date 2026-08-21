import { apiErrorSchema, type TApiErrorCode } from "@lexeme/contracts";
import type { z } from "zod";

/**
 * Where the API is.
 *
 * Empty in dev, where the Vite server proxies `/api` and everything is one
 * origin, so the session cookie is first-party and nothing needs configuring.
 * In production it is the Railway host (e.g. `https://api.lexeme.fyi`), which
 * is same-site with the app, a sibling subdomain, so the cookie still rides
 * along, given `COOKIE_DOMAIN` on the server.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? "";

/** An absolute URL for an API path, usable as an `<img src>` as well. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * A refusal the server named, rather than a network fault.
 *
 * This is the piece of tRPC worth keeping: screens branch on whether a deck is
 * missing, forbidden, or merely unreachable, and a bare `Error` collapses all
 * three into "something went wrong". `lib/query-state.ts` reads `code` off
 * this exactly as it used to read it off a `TRPCClientError`.
 */
export class ApiError extends Error {
  constructor(
    readonly code: TApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readError(response: Response): Promise<ApiError> {
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(parsed.data.error.code, parsed.data.error.message);
    }
  } catch {
    // A non-JSON body (a proxy's error page, a truncated response) tells us
    // nothing the status code doesn't; fall through.
  }
  return new ApiError(
    response.status === 401
      ? "UNAUTHORIZED"
      : response.status === 404
        ? "NOT_FOUND"
        : "INTERNAL_SERVER_ERROR",
    `Request failed (${response.status}).`,
  );
}

/**
 * One request, parsed against its contract.
 *
 * `credentials: "include"` is not optional: the API is a different origin in
 * production, and without it the session cookie is left behind and every call
 * comes back 401.
 */
async function request<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.infer<TSchema>> {
  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw await readError(response);

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      "INTERNAL_SERVER_ERROR",
      "The server answered in a shape this app doesn't understand.",
    );
  }
  return parsed.data;
}

export function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  return request(path, schema);
}

export function apiPost<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  body: unknown,
): Promise<z.infer<TSchema>> {
  return request(path, schema, { method: "POST", body: JSON.stringify(body) });
}
