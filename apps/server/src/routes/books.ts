import {
  MAX_SENT_BOOK_BYTES,
  SENDABLE_BOOK_EXTENSIONS,
  type TDeviceBooksResponse,
} from "@lexeme/contracts";
import { sentBooks } from "@lexeme/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";

import { authenticateApiKey } from "../caller.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { requireUserId } from "../http.ts";
import { deleteObject, getObject, putObject } from "../storage.ts";
import { bearerToken } from "../tokens.ts";

const CONTENT_TYPES: Record<string, string> = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
  cbz: "application/vnd.comicbook+zip",
  djvu: "image/vnd.djvu",
  fb2: "application/x-fictionbook+xml",
  txt: "text/plain",
};

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

async function findBook(userId: string, id: string) {
  const [book] = await db
    .select()
    .from(sentBooks)
    .where(and(eq(sentBooks.id, id), eq(sentBooks.user_id, userId)));
  if (!book) throw new ApiError("NOT_FOUND", "That book isn't in your sent books.");
  return book;
}

/** The web app: send a book, or take one back. */
export const bookRoutes = new Hono()
  .post("/", async (c) => {
    const userId = await requireUserId(c);
    const form = await c.req.formData().catch(() => {
      throw new ApiError("BAD_REQUEST", "Send the book as a file upload.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose a book to send.");
    const extension = extensionOf(file.name);
    if (!(SENDABLE_BOOK_EXTENSIONS as readonly string[]).includes(extension)) {
      throw new ApiError("BAD_REQUEST", `Kindles here open ${SENDABLE_BOOK_EXTENSIONS.join(", ")} files.`);
    }
    if (file.size > MAX_SENT_BOOK_BYTES) throw new ApiError("BAD_REQUEST", "Books can be up to 100 MB.");

    const id = randomUUID();
    const storageKey = `sent-books/${userId}/${id}.${extension}`;
    const contentType = CONTENT_TYPES[extension] ?? "application/octet-stream";
    await putObject(storageKey, new Uint8Array(await file.arrayBuffer()), contentType);
    await db.insert(sentBooks).values({
      id,
      user_id: userId,
      title: file.name.replace(/\.[^.]+$/, ""),
      file_name: file.name,
      content_type: contentType,
      size_bytes: file.size,
      storage_key: storageKey,
    });
    return c.json({ id });
  })
  .delete("/:id", async (c) => {
    const userId = await requireUserId(c);
    const book = await findBook(userId, c.req.param("id"));
    await deleteObject(book.storage_key);
    await db.delete(sentBooks).where(eq(sentBooks.id, book.id));
    return c.json({ ok: true as const });
  });

async function requireDeviceUser(c: Context) {
  const token = bearerToken(c.req.raw);
  const caller = token ? await authenticateApiKey(token) : undefined;
  if (!caller) throw new ApiError("UNAUTHORIZED", "Connect this device to Lexeme again.");
  return caller.userId;
}

/** The e-reader: what's waiting for it, the file, and "got it". */
export const deviceBookRoutes = new Hono()
  .get("/", async (c) => {
    const userId = await requireDeviceUser(c);
    const waiting = await db
      .select()
      .from(sentBooks)
      .where(and(eq(sentBooks.user_id, userId), isNull(sentBooks.delivered_at)))
      .orderBy(asc(sentBooks.created_at));
    return c.json({
      books: waiting.map((book) => ({
        id: book.id,
        title: book.title,
        file_name: book.file_name,
        size_bytes: book.size_bytes,
        sent_at: book.created_at.toISOString(),
      })),
    } satisfies TDeviceBooksResponse);
  })
  .get("/:id/file", async (c) => {
    const userId = await requireDeviceUser(c);
    const book = await findBook(userId, c.req.param("id"));
    const { body, length } = await getObject(book.storage_key);
    return new Response(body, {
      headers: {
        "Content-Type": book.content_type,
        ...(length !== undefined ? { "Content-Length": String(length) } : {}),
      },
    });
  })
  .post("/:id/delivered", async (c) => {
    const userId = await requireDeviceUser(c);
    const book = await findBook(userId, c.req.param("id"));
    await db.update(sentBooks).set({ delivered_at: new Date() }).where(eq(sentBooks.id, book.id));
    return c.json({ ok: true as const });
  });
