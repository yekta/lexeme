import { MAX_SENT_BOOK_BYTES, SENDABLE_BOOK_EXTENSIONS } from "@lexeme/contracts";
import { sentBooks } from "@lexeme/db";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";

import { readBookUpload, signBookUpload } from "./book-uploads.ts";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { ApiError } from "./errors.ts";
import { deleteObject, objectSize, putObject, uploadUrl } from "./storage.ts";
import { ISSUER } from "./urls.ts";

const CONTENT_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  cbz: "application/vnd.comicbook+zip",
  djvu: "image/vnd.djvu",
  fb2: "application/x-fictionbook+xml",
  txt: "text/plain",
};

const DOWNLOAD_TIMEOUT_MS = 120_000;
const UPLOAD_LINK_SECONDS = 60 * 60;
const FINISH_LINK_MS = 2 * 60 * 60 * 1000;
const MAX_REDIRECTS = 5;

const PRIVATE_ADDRESSES = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [["::", 127], ["fc00::", 7], ["fe80::", 10]] as const) {
  PRIVATE_ADDRESSES.addSubnet(network, prefix, "ipv6");
}
const TOO_BIG = "Books can be up to 100 MB.";

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function checkBookFile(fileName: string, size: number) {
  if (!(SENDABLE_BOOK_EXTENSIONS as readonly string[]).includes(extensionOf(fileName))) {
    throw new ApiError("BAD_REQUEST", `Kindles here open ${SENDABLE_BOOK_EXTENSIONS.join(", ")} files.`);
  }
  if (size > MAX_SENT_BOOK_BYTES) throw new ApiError("BAD_REQUEST", TOO_BIG);
}

function storedFile(userId: string, id: string, fileName: string) {
  const extension = extensionOf(fileName);
  return {
    storageKey: `sent-books/${userId}/${id}.${extension}`,
    contentType: CONTENT_TYPES[extension] ?? "application/octet-stream",
  };
}

async function recordSentBook(userId: string, id: string, fileName: string, size: number, title?: string) {
  const { storageKey, contentType } = storedFile(userId, id, fileName);
  await db
    .insert(sentBooks)
    .values({
      id,
      user_id: userId,
      title: title ?? fileName.replace(/\.[^.]+$/, ""),
      file_name: fileName,
      content_type: contentType,
      size_bytes: size,
      storage_key: storageKey,
    })
    .onConflictDoNothing({ target: sentBooks.id });
  return findSentBook(userId, id);
}

export async function saveSentBook(userId: string, fileName: string, bytes: Uint8Array, title?: string) {
  checkBookFile(fileName, bytes.byteLength);
  const id = randomUUID();
  const { storageKey, contentType } = storedFile(userId, id, fileName);
  await putObject(storageKey, bytes, contentType);
  return recordSentBook(userId, id, fileName, bytes.byteLength, title);
}

/** A link to put the file straight into storage, and one that sends it once it's there. */
export async function startBookUpload(userId: string, fileName: string, title?: string) {
  checkBookFile(fileName, 0);
  const id = randomUUID();
  const expiresAt = Date.now() + FINISH_LINK_MS;
  const token = signBookUpload({ userId, id, fileName, title, expiresAt }, env.BETTER_AUTH_SECRET);
  return {
    uploadUrl: await uploadUrl(storedFile(userId, id, fileName).storageKey, UPLOAD_LINK_SECONDS),
    finishUrl: `${ISSUER}/api/book-uploads/${token}`,
    expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000),
  };
}

export async function finishBookUpload(token: string) {
  const upload = readBookUpload(token, env.BETTER_AUTH_SECRET);
  if (!upload) throw new ApiError("UNAUTHORIZED", "This upload link isn't valid or has expired; call upload-book again.");
  const { storageKey } = storedFile(upload.userId, upload.id, upload.fileName);
  const size = await objectSize(storageKey);
  if (size === undefined) throw new ApiError("BAD_REQUEST", "The file isn't uploaded yet; run the whole command.");
  if (size === 0 || size > MAX_SENT_BOOK_BYTES) {
    await deleteObject(storageKey);
    throw new ApiError("BAD_REQUEST", size === 0 ? "The uploaded file is empty." : TOO_BIG);
  }
  return recordSentBook(upload.userId, upload.id, upload.fileName, size, upload.title);
}

/** What the API and MCP show of a sent book. */
export function presentSentBook(book: typeof sentBooks.$inferSelect) {
  return {
    id: book.id,
    title: book.title,
    file_name: book.file_name,
    size_bytes: book.size_bytes,
    sent_at: book.created_at.toISOString(),
    delivered_at: book.delivered_at?.toISOString() ?? null,
  };
}

export async function findSentBook(userId: string, id: string) {
  const [book] = await db
    .select()
    .from(sentBooks)
    .where(and(eq(sentBooks.id, id), eq(sentBooks.user_id, userId)));
  if (!book) throw new ApiError("NOT_FOUND", "That book isn't in your sent books.");
  return book;
}

export async function deleteSentBook(userId: string, id: string) {
  const book = await findSentBook(userId, id);
  await deleteObject(book.storage_key);
  await db.delete(sentBooks).where(eq(sentBooks.id, book.id));
}

function fileNameFromDisposition(header: string | null) {
  if (!header) return undefined;
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)?.[1];
  if (encoded) return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ""));
  return /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim();
}

function fileNameFromUrl(url: URL) {
  const last = url.pathname.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last) : undefined;
}

async function readCapped(body: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > MAX_SENT_BOOK_BYTES) throw new ApiError("BAD_REQUEST", TOO_BIG);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function checkPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ApiError("BAD_REQUEST", "The link has to be http or https.");
  }
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true }).catch(() => {
    throw new ApiError("BAD_REQUEST", "Couldn't find the server in that link.");
  });
  if (addresses.some(({ address, family }) => PRIVATE_ADDRESSES.check(address, family === 6 ? "ipv6" : "ipv4"))) {
    throw new ApiError("BAD_REQUEST", "The link has to point at a public server.");
  }
}

async function fetchPublic(link: string) {
  let url = new URL(link);
  const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await checkPublicUrl(url);
    const response = await fetch(url, { redirect: "manual", signal }).catch(() => {
      throw new ApiError("BAD_REQUEST", "Couldn't download the book from that link.");
    });
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return { response, url };
    url = new URL(location, url);
  }
  throw new ApiError("BAD_REQUEST", "The link redirects too many times.");
}

/** Downloads a book from a public link; the file name comes from the response when the caller doesn't give one. */
export async function downloadBook(link: string, fileName?: string) {
  const { response, url } = await fetchPublic(link);
  if (!response.ok || !response.body) {
    throw new ApiError("BAD_REQUEST", `Downloading the book failed (HTTP ${response.status}).`);
  }
  if (Number(response.headers.get("content-length")) > MAX_SENT_BOOK_BYTES) {
    throw new ApiError("BAD_REQUEST", TOO_BIG);
  }
  const name = fileName ?? fileNameFromDisposition(response.headers.get("content-disposition")) ?? fileNameFromUrl(url);
  if (!name) throw new ApiError("BAD_REQUEST", "Couldn't tell the book's file name; pass file_name.");
  checkBookFile(name, 0);
  return { fileName: name, bytes: await readCapped(response.body) };
}
