import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * The FSRS optimizer is a threaded wasm build, so it needs SharedArrayBuffer,
 * which browsers only grant to cross-origin isolated pages. `require-corp` is
 * the mode Safari supports; the cost is that cross-origin subresources without
 * CORP headers stop loading, which is why the Google avatar comes through the
 * API's `/api/avatar` (and why that endpoint sets `cross-origin`).
 *
 * In production these come from `public/_headers`, which Cloudflare Pages
 * reads. The dev server has no such file, hence the duplication.
 */
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/** Where the API lives in dev. Must match the health check in `pnpm dev`. */
const devApiTarget = "http://localhost:3001";

export default defineConfig({
  plugins: [
    // File-based routing, same convention as before: a file under src/routes is
    // a route, and this regenerates routeTree.gen.ts. What is gone is the
    // server half — `createFileRoute(...).server.handlers` was a TanStack Start
    // feature, and those handlers are Hono routes in apps/server now.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    // Mirrors the `@/*` mapping in tsconfig.json.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  // Read VITE_* variables from the repo-root .env, shared with the server.
  envDir: "../..",
  worker: { format: "es" },
  server: {
    port: 3000,
    headers: crossOriginIsolation,
    // The API is fronted by the dev server so the session cookie stays
    // first-party and no CORS or COOKIE_DOMAIN setup is needed to develop.
    proxy: { "/api": devApiTarget },
  },
  // `server.proxy` does not apply to preview, so repeat it; otherwise the
  // production bundle cannot reach auth and the preview is unusable for the
  // performance checks it exists for.
  preview: {
    port: 4173,
    headers: crossOriginIsolation,
    proxy: { "/api": devApiTarget },
  },
});
