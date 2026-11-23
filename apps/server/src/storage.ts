import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

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

export async function getObject(key: string) {
  const object = await call(() => storage().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
  if (!object.Body) throw new ApiError("NOT_FOUND", "That file is gone.");
  return { body: object.Body.transformToWebStream(), length: object.ContentLength };
}

export async function deleteObject(key: string) {
  await call(() => storage().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key })));
}
