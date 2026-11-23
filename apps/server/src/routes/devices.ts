import {
  pollPairingRequest,
  startPairingRequest,
  type TPairingResponse,
  type TPollPairingResponse,
  type TStartPairingResponse,
} from "@lexeme/contracts";
import { apiKeys, devicePairings, user } from "@lexeme/db";
import { and, eq, isNull, like, lt } from "drizzle-orm";
import { Hono } from "hono";
import { randomInt } from "node:crypto";

import { db } from "../db.ts";
import { env } from "../env.ts";
import { ApiError } from "../errors.ts";
import { parseBody, requireUserId } from "../http.ts";
import { API_KEY_PREFIX, hashToken, newToken } from "../tokens.ts";

const PAIRING_MINUTES = 10;
const POLL_INTERVAL_SECONDS = 3;
const POLL_TOKEN_PREFIX = "lxp_";
/** No 0/O, 1/I/L: the code is read off an e-ink screen and typed. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newUserCode() {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

function normalizeCode(code: string) {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function isExpired(pairing: { expires_at: Date }) {
  return pairing.expires_at <= new Date();
}

/** A unique key name for the device, so pairing the same Kindle twice doesn't collide. */
async function keyName(userId: string, deviceName: string) {
  const taken = await db
    .select({ name: apiKeys.name })
    .from(apiKeys)
    .where(and(eq(apiKeys.user_id, userId), like(apiKeys.name, `${deviceName}%`)));
  const names = new Set(taken.map((key) => key.name));
  if (!names.has(deviceName)) return deviceName;
  let n = 2;
  while (names.has(`${deviceName} (${n})`)) n += 1;
  return `${deviceName} (${n})`;
}

async function findByCode(code: string) {
  const [pairing] = await db
    .select()
    .from(devicePairings)
    .where(eq(devicePairings.user_code, normalizeCode(code)))
    .limit(1);
  if (!pairing) throw new ApiError("NOT_FOUND", "That code doesn't match a device. Check it and try again.");
  return pairing;
}

export const deviceRoutes = new Hono()
  /** The device asks to be paired. No credentials: it has none yet. */
  .post("/pair", async (c) => {
    const input = await parseBody(c, startPairingRequest);
    // Old attempts are only kept long enough to answer a late poll with "expired".
    await db.delete(devicePairings).where(lt(devicePairings.expires_at, new Date(Date.now() - 24 * 60 * 60_000)));
    const poll = newToken(POLL_TOKEN_PREFIX);
    const expiresAt = new Date(Date.now() + PAIRING_MINUTES * 60_000);
    const userCode = newUserCode();
    await db.insert(devicePairings).values({
      user_code: userCode,
      poll_token_hash: poll.hash,
      device_name: input.device_name,
      expires_at: expiresAt,
    });
    const approveUrl = `${env.WEB_ORIGIN.replace(/\/+$/, "")}/pair?code=${userCode}`;
    return c.json({
      user_code: userCode,
      poll_token: poll.token,
      approve_url: approveUrl,
      expires_at: expiresAt.toISOString(),
      poll_interval_seconds: POLL_INTERVAL_SECONDS,
    } satisfies TStartPairingResponse);
  })

  /** The device waits for approval; the first poll after it gets the device's API key. */
  .post("/pair/poll", async (c) => {
    const input = await parseBody(c, pollPairingRequest);
    const [pairing] = await db
      .select()
      .from(devicePairings)
      .where(eq(devicePairings.poll_token_hash, hashToken(input.poll_token)))
      .limit(1);
    if (!pairing || pairing.claimed_at) throw new ApiError("NOT_FOUND", "Start pairing again on the device.");
    if (!pairing.user_id || !pairing.approved_at) {
      const status = isExpired(pairing) ? "expired" : "pending";
      return c.json({ status } satisfies TPollPairingResponse);
    }

    const userId = pairing.user_id;
    const key = newToken(API_KEY_PREFIX);
    const claimed = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(apiKeys)
        .values({
          user_id: userId,
          name: await keyName(userId, pairing.device_name),
          role: "editor",
          token_prefix: key.displayPrefix,
          token_hash: key.hash,
        })
        .returning({ id: apiKeys.id });
      const updated = await tx
        .update(devicePairings)
        .set({ claimed_at: new Date(), api_key_id: inserted.id })
        .where(and(eq(devicePairings.id, pairing.id), isNull(devicePairings.claimed_at)))
        .returning({ id: devicePairings.id });
      if (updated.length === 0) tx.rollback();
      return true;
    }).catch(() => false);
    if (!claimed) throw new ApiError("NOT_FOUND", "Start pairing again on the device.");

    const [account] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
    return c.json({
      status: "approved",
      token: key.token,
      user_name: account?.name ?? "",
    } satisfies TPollPairingResponse);
  })

  /** What the web app's approve page shows (session only). */
  .get("/pair/:code", async (c) => {
    await requireUserId(c);
    const pairing = await findByCode(c.req.param("code"));
    let status: TPairingResponse["status"] = "pending";
    if (pairing.approved_at) status = "approved";
    else if (isExpired(pairing)) status = "expired";
    return c.json({ device_name: pairing.device_name, status } satisfies TPairingResponse);
  })

  .post("/pair/:code/approve", async (c) => {
    const userId = await requireUserId(c);
    const pairing = await findByCode(c.req.param("code"));
    if (pairing.approved_at) {
      if (pairing.user_id === userId) return c.json({ ok: true as const });
      throw new ApiError("FORBIDDEN", "Another account already approved this device.");
    }
    if (isExpired(pairing)) throw new ApiError("BAD_REQUEST", "This code has expired. Start pairing again on the device.");
    await db
      .update(devicePairings)
      .set({ user_id: userId, approved_at: new Date() })
      .where(and(eq(devicePairings.id, pairing.id), isNull(devicePairings.approved_at)));
    return c.json({ ok: true as const });
  });
