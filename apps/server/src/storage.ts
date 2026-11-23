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

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await storage().send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

export async function getObject(key: string) {
  const object = await storage().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!object.Body) throw new ApiError("NOT_FOUND", "That file is gone.");
  return { body: object.Body.transformToWebStream(), length: object.ContentLength };
}

export async function deleteObject(key: string) {
  await storage().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
