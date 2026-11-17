import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "lx_";
export const OAUTH_ACCESS_TOKEN_PREFIX = "lxat_";
export const OAUTH_REFRESH_TOKEN_PREFIX = "lxrt_";

const DISPLAY_PREFIX_CHARS = 4;

/** 256 random bits, so a fast hash is enough to store them. */
export function newToken(prefix: string) {
  const token = prefix + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    displayPrefix: token.slice(0, prefix.length + DISPLAY_PREFIX_CHARS),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token || undefined;
}
