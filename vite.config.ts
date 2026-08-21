import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, type PluginOption } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * The FSRS optimizer is a threaded wasm build, so it needs SharedArrayBuffer,
 * which browsers only grant to cross-origin isolated pages. `require-corp` is
 * the mode Safari supports; the cost is that cross-origin subresources without
 * CORP headers (the Google avatar in the navbar) stop loading.
 */
const crossOriginIsolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

/**
 * Nitro's dev middleware treats any Sec-Fetch-Dest other than document/empty as
 * a static asset, so `<img src="/api/...">` 404s before reaching a server route.
 */
const devApiFetchDest: PluginOption = {
  name: "lexeme:dev-api-fetch-dest",
  enforce: "pre",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url?.startsWith("/api/")) delete req.headers["sec-fetch-dest"];
      next();
    });
  },
};

export default defineConfig({
  server: {
    port: 3000,
    headers: crossOriginIsolation,
  },
  preview: {
    headers: crossOriginIsolation,
  },
  resolve: {
    tsconfigPaths: true,
  },
  worker: {
    format: "es",
  },
  plugins: [
    devApiFetchDest,
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      /**
       * Ship the app as a prerendered shell served for every route, rather than
       * server-rendering each request.
       *
       * Nothing is lost: every screen is already `ClientOnly` (the data layer
       * reads from Zero's local store, which does not exist on the server), so
       * SSR was paying a round trip to deliver a skeleton. Now the document is
       * static and the first paint never waits on the network — which is the
       * whole point of holding the account on the device.
       *
       * The server does not go away: `/api/auth`, `/api/trpc`, `/api/zero/*`
       * and `/api/avatar` are still Nitro routes.
       */
      spa: {
        enabled: true,
        prerender: { enabled: true },
      },
    }),
    viteReact(),
    nitro({
      /**
       * Cloudflare Workers. `nodeCompat` is what lets better-auth, drizzle,
       * postgres.js and the Anthropic SDK run: postgres.js ships a `workerd`
       * build that reaches Postgres over `cloudflare:sockets`, so the server
       * routes keep talking to Railway with no driver change.
       *
       * `deployConfig` is deliberately off. Turning it on makes Nitro write
       * `.wrangler/deploy/config.json`, and Cloudflare then treats that as the
       * source of truth and *discards the environment variables set in the
       * dashboard* — which is where this app's secrets live.
       */
      preset: "cloudflare_module",
      compatibilityDate: "2026-08-01",
      cloudflare: {
        nodeCompat: true,
        // Without this Nitro derives the Worker name from the repo
        // ("yekta-lexeme") and `wrangler deploy` creates a second Worker beside
        // the one the dashboard made. Must match the Cloudflare project name.
        wrangler: { name: "lexeme" },
      },
      routeRules: {
        "/**": { headers: crossOriginIsolation },
        // Vercel stops at the first matching route, and the built-in
        // /assets/** cache-control rule is more specific than /**.
        "/assets/**": { headers: crossOriginIsolation },
      },
    }),
  ],
});
