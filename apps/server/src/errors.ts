import { API_ERROR_STATUS, type TApiError, type TApiErrorCode } from "@lexeme/contracts";

/**
 * A settled refusal, with a name the browser can act on.
 *
 * tRPC gave this for free; without it every handler would answer 500 and the
 * screens that distinguish "this deck is gone" from "the network coughed" would
 * lose the distinction. Throw one anywhere below a route and `toErrorResponse`
 * turns it into the JSON body `@lexeme/contracts` describes.
 */
export class ApiError extends Error {
  constructor(
    readonly code: TApiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

/**
 * The single place an exception becomes a response.
 *
 * Anything that is not an `ApiError` is a bug rather than an answer, so it is
 * logged in full and reported as a bare 500: the message may name a table, a
 * column or a connection string, and none of that belongs in a browser.
 */
export function toErrorResponse(error: unknown): { body: TApiError; status: number } {
  if (error instanceof ApiError) {
    return {
      body: { error: { code: error.code, message: error.message } },
      status: API_ERROR_STATUS[error.code],
    };
  }
  console.error("[api] unhandled error:", error);
  return {
    body: {
      error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Please try again." },
    },
    status: 500,
  };
}
