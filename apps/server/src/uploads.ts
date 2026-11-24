import { createHmac, timingSafeEqual } from "node:crypto";

export type TUploadKind = "book-upload" | "reading-import";

function signature(kind: TUploadKind, payload: string, secret: string) {
  return createHmac("sha256", secret).update(`${kind}:${payload}`).digest("base64url");
}

/** The token in the link that finishes an upload: who it's for and what it is, signed so it can't be changed. */
export function signUpload<T extends { expiresAt: number }>(kind: TUploadKind, upload: T, secret: string) {
  const payload = Buffer.from(JSON.stringify(upload)).toString("base64url");
  return `${payload}.${signature(kind, payload, secret)}`;
}

export function readUpload<T extends { expiresAt: number }>(
  kind: TUploadKind,
  token: string,
  secret: string,
  now = Date.now(),
): T | undefined {
  const [payload, given] = token.split(".");
  if (!payload || !given) return undefined;
  const expected = Buffer.from(signature(kind, payload, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  const upload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  if (upload.expiresAt <= now) return undefined;
  return upload;
}

export function fileNameOfPath(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function shellQuote(text: string) {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/** Quoted for a POSIX shell, keeping a leading `~/` working. */
function shellPath(path: string) {
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return `"$HOME"/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}

/** Uploads the file straight to storage, then tells Lexeme it's there; prints Lexeme's answer as JSON. */
export function uploadCommand(path: string, uploadUrl: string, finishUrl: string) {
  return `curl --fail-with-body -sS -T ${shellPath(path)} ${shellQuote(uploadUrl)} && curl --fail-with-body -sS -X POST ${shellQuote(finishUrl)}`;
}
