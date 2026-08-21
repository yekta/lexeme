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
import { avatarRoutes } from "./routes/avatar.ts";
import { cardRoutes } from "./routes/cards.ts";
import { deckRoutes } from "./routes/decks.ts";
import { zeroRoutes } from "./routes/zero.ts";

/**
 * Where the drizzle migrations are, resolved from this module rather than from
 * the working directory — the two differ, and so do the two layouts. Running
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

/**
 * Dev goes through the web dev server's proxy, so it is same-origin and this
 * does nothing. In production the app is on Cloudflare Pages and this is on
 * Railway: different origins, so every call needs an allow-list entry, and
 * `credentials` is what lets the session cookie ride along.
 */
app.use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true }));

/**
 * One place where a thrown error becomes a response, so no handler has to
 * remember to catch. `ApiError` carries the code the browser branches on;
 * anything else is a bug and comes back as a bare 500.
 */
app.onError((error, c) => {
  const { body, status } = toErrorResponse(error);
  return c.json(body, status as 400);
});

// Railway's health check, and a readiness probe for the web dev server, which
// waits on it before starting Vite so the proxy never opens onto a dead port.
app.get("/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/zero", zeroRoutes);
app.route("/api/decks", deckRoutes);
app.route("/api/cards", cardRoutes);
app.route("/api/avatar", avatarRoutes);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.info(`[api] listening on :${info.port} (${env.NODE_ENV}), web origin ${env.WEB_ORIGIN}`);
});
