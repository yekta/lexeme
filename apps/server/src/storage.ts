import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "./env.ts";
import { ApiError } from "./errors.ts";

let client: S3Client | undefined;

export function isStorageConfigured() {
  return Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

function storage() {
  if (!isStorageConfigured()) {
    throw new ApiError("PRECONDITION_FAILED", "Sending books isn't set up on this server.");
  }
  client ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    // Self-hosted S3 (MinIO and friends) serves buckets by path, not subdomain.
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    // Otherwise signed upload links carry the checksum of an empty body and every upload fails.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}

/** A refusal from the bucket is a setup problem; say which one instead of a bare 500. */
async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AccessDenied" || name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch" || name === "NoSuchBucket") {
      console.error("[api] book storage refused:", error);
      throw new ApiError(
        "PRECONDITION_FAILED",
        `Book storage refused the request (${name}). Check the S3 endpoint, bucket and key on the server.`,
      );
    }
    throw error;
  }
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await call(() =>
    storage().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType })),
  );
}

/** A link that lets whoever holds it PUT this one object, straight to the bucket. */
export async function uploadUrl(key: string, expiresInSeconds: number) {
  return call(() => getSignedUrl(storage(), new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn: expiresInSeconds }));
}

/** The object's size, or undefined when there is none. */
export async function objectSize(key: string) {
  try {
    const head = await call(() => storage().send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
    return head.ContentLength ?? 0;
  } catch (error) {
    if (error instanceof Error && (error.name === "NotFound" || error.name === "NoSuchKey")) return undefined;
    throw error;
  }
}

export async function getObject(key: string) {
  const object = await call(() => storage().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
  if (!object.Body) throw new ApiError("NOT_FOUND", "That file is gone.");
  return { body: object.Body.transformToWebStream(), length: object.ContentLength };
}

export async function deleteObject(key: string) {
  await call(() => storage().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
}
