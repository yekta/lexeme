import { type TDeviceBooksResponse } from "@lexeme/contracts";
import { sentBooks } from "@lexeme/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";

import { authenticateApiKey } from "../caller.ts";
import { db } from "../db.ts";
import { ApiError } from "../errors.ts";
import { requireUserId } from "../http.ts";
import { checkBookFile, deleteSentBook, findSentBook, saveSentBook } from "../sent-books.ts";
import { getObject } from "../storage.ts";
import { bearerToken } from "../tokens.ts";

/** The web app: send a book, or take one back. */
export const bookRoutes = new Hono()
  .post("/", async (c) => {
    const userId = await requireUserId(c);
    const form = await c.req.formData().catch(() => {
      throw new ApiError("BAD_REQUEST", "Send the book as a file upload.");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError("BAD_REQUEST", "Choose a book to send.");
    checkBookFile(file.name, file.size);
    const book = await saveSentBook(userId, file.name, new Uint8Array(await file.arrayBuffer()));
    return c.json({ id: book.id });
  })
  .delete("/:id", async (c) => {
    const userId = await requireUserId(c);
    await deleteSentBook(userId, c.req.param("id"));
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
    const book = await findSentBook(userId, c.req.param("id"));
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
    const book = await findSentBook(userId, c.req.param("id"));
    await db.update(sentBooks).set({ delivered_at: new Date() }).where(eq(sentBooks.id, book.id));
    return c.json({ ok: true as const });
  });
