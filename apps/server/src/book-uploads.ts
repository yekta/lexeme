import { createHmac, timingSafeEqual } from "node:crypto";

export type TBookUpload = {
  userId: string;
  id: string;
  fileName: string;
  title?: string;
  expiresAt: number;
};

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`book-upload:${payload}`).digest("base64url");
}

/** The token in the link that finishes an upload: who it's for and what it is, signed so it can't be changed. */
export function signBookUpload(upload: TBookUpload, secret: string) {
  const payload = Buffer.from(JSON.stringify(upload)).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function readBookUpload(token: string, secret: string, now = Date.now()): TBookUpload | undefined {
  const [payload, given] = token.split(".");
  if (!payload || !given) return undefined;
  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(given);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  const upload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TBookUpload;
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

/** Uploads the file straight to storage, then tells Lexeme it's there; prints the sent book as JSON. */
export function uploadCommand(path: string, uploadUrl: string, finishUrl: string) {
  return `curl --fail-with-body -sS -T ${shellPath(path)} ${shellQuote(uploadUrl)} && curl --fail-with-body -sS -X POST ${shellQuote(finishUrl)}`;
}
