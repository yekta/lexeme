import { syncReadingArgs } from "@lexeme/contracts";
import { randomUUID } from "node:crypto";

import { runMutator } from "./api/data.ts";
import { env } from "./env.ts";
import { ApiError } from "./errors.ts";
import { readingBatches } from "./reading-batches.ts";
import { FINISH_LINK_MS, UPLOAD_LINK_SECONDS } from "./sent-books.ts";
import { deleteObject, getObject, objectSize, uploadUrl } from "./storage.ts";
import { readUpload, signUpload } from "./uploads.ts";
import { ISSUER } from "./urls.ts";
import { serverMutators } from "./zero.ts";

type TReadingUpload = { userId: string; id: string; expiresAt: number };

const MAX_READING_UPLOAD_BYTES = 50 * 1024 * 1024;

const storageKey = (userId: string, id: string) => `reading-uploads/${userId}/${id}.json`;

/** A link to put a sync-reading file straight into storage, and one that applies it once it's there. */
export async function startReadingUpload(userId: string) {
  const id = randomUUID();
  const token = signUpload("reading-upload", { userId, id, expiresAt: Date.now() + FINISH_LINK_MS }, env.BETTER_AUTH_SECRET);
  return {
    uploadUrl: await uploadUrl(storageKey(userId, id), UPLOAD_LINK_SECONDS),
    finishUrl: `${ISSUER}/api/reading-uploads/${token}`,
    expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000),
  };
}

export async function finishReadingUpload(token: string) {
  const upload = readUpload<TReadingUpload>("reading-upload", token, env.BETTER_AUTH_SECRET);
  if (!upload) throw new ApiError("UNAUTHORIZED", "This upload link isn't valid or has expired; call upload-reading again.");
  const key = storageKey(upload.userId, upload.id);
  const size = await objectSize(key);
  if (size === undefined) throw new ApiError("BAD_REQUEST", "The file isn't uploaded yet; run the whole command.");
  if (size > MAX_READING_UPLOAD_BYTES) {
    await deleteObject(key);
    throw new ApiError("BAD_REQUEST", "Reading files can be up to 50 MB.");
  }
  const text = await new Response((await getObject(key)).body).text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError("BAD_REQUEST", "The file isn't JSON.");
  }
  const parsed = syncReadingArgs.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError("BAD_REQUEST", `${issue?.path.join(".") ?? ""}: ${issue?.message ?? "Invalid reading data."}`);
  }
  for (const batch of readingBatches(parsed.data)) {
    await runMutator(upload.userId, serverMutators.reading.sync, batch);
  }
  await deleteObject(key);
  return {
    books: parsed.data.books.length,
    page_reads: parsed.data.page_reads.length,
    highlights: parsed.data.highlights.length,
    lookups: parsed.data.lookups.length,
  };
}
