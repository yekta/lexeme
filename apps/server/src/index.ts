import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { auth } from "./auth.ts";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { toErrorResponse } from "./errors.ts";
import { apiKeyRoutes } from "./routes/api-keys.ts";
import { avatarRoutes } from "./routes/avatar.ts";
import { cardRoutes } from "./routes/cards.ts";
import { connectedAppRoutes } from "./routes/connected-apps.ts";
import { deckRoutes } from "./routes/decks.ts";
import { bookRoutes, bookUploadRoutes, deviceBookRoutes } from "./routes/books.ts";
import { deviceRoutes } from "./routes/devices.ts";
import { mcpRoutes } from "./routes/mcp.ts";
import { oauthRoutes } from "./routes/oauth.ts";
import { oauthConsentRoutes } from "./routes/oauth-consent.ts";
import { v1Routes } from "./routes/v1.ts";
import { zeroRoutes } from "./routes/zero.ts";

/**
 * Where the drizzle migrations are, resolved from this module rather than from
 * the working directory: the two differ, and so do the two layouts. Running
 * from source (`tsx watch src/index.ts`) they are still in `@lexeme/db`; in the
 * built bundle they sit beside `dist/`, copied there because they are read at
 * runtime rather than bundled (build.mjs).
 */
function migrationsFolder(): string {
  const candidates = ["../drizzle", "../../../packages/db/drizzle"];
  for (const candidate of candidates) {
    const path = fileURLToPath(new URL(candidate, import.meta.url));
    if (existsSync(path)) return path;
  }
  throw new Error("No drizzle migrations folder found; run the server build first.");
}

// Unconditional, and before the server listens. The deploy that ships a schema
// change and the process that needs it are the same deploy, so there is no
// version of this worth making configurable: a flag would only ever be a way to
// boot code against a database that cannot serve it. drizzle records what it has
// applied, so a restart with nothing pending is a no-op.
await migrate(db, { migrationsFolder: migrationsFolder() });
console.info("[api] migrations applied");

const app = new Hono();

const appCors = cors({ origin: env.WEB_ORIGIN, credentials: true });
// API keys are bearer tokens, never cookies, so any origin may call v1.
const publicCors = cors({ origin: "*" });

/**
 * Dev goes through the web dev server's proxy, so it is same-origin and this
 * does nothing. In production the app is on Cloudflare Pages and this is on
 * Unbind: different origins, so every call needs an allow-list entry, and
 * `credentials` is what lets the session cookie ride along.
 */
app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/v1")) return publicCors(c, next);
  return appCors(c, next);
});

/**
 * One place where a thrown error becomes a response, so no handler has to
 * remember to catch. `ApiError` carries the code the browser branches on;
 * anything else is a bug and comes back as a bare 500.
 */
app.onError((error, c) => {
  const { body, status } = toErrorResponse(error);
  return c.json(body, status as 400);
});

// A readiness probe for the web dev server, which waits on it before starting
// Vite so the proxy never opens onto a dead port.
app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/zero", zeroRoutes);
app.route("/api/decks", deckRoutes);
app.route("/api/devices/books", deviceBookRoutes);
app.route("/api/devices", deviceRoutes);
app.route("/api/books", bookRoutes);
app.route("/api/book-uploads", bookUploadRoutes);
app.route("/api/cards", cardRoutes);
app.route("/api/avatar", avatarRoutes);
app.route("/api/api-keys", apiKeyRoutes);
app.route("/api/connected-apps", connectedAppRoutes);
app.route("/api/oauth/consent", oauthConsentRoutes);
app.route("/api/v1", v1Routes);
app.route("/mcp", mcpRoutes);
app.route("/", oauthRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`[api] listening on :${info.port} (${env.NODE_ENV}), web origin ${env.WEB_ORIGIN}`);
});
