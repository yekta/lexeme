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
       * SPA mode is deliberately OFF on Cloudflare.
       *
       * It produces a prerendered `_shell.html` served for every route, which
       * is the nicer shape — but the prerender needs a running server to fetch
       * `/` from, and on the `cloudflare_module` preset Nitro provides that by
       * spawning `npx wrangler dev`. That process watches its assets directory,
       * so writing the shell into it triggers a reload and wrangler then sits
       * there watching forever. The build renders the page, succeeds, and never
       * exits — a hung deploy with a green log.
       *
       * The cost of leaving it off is small: every route is already
       * `ClientOnly`, so the Worker renders the same empty skeleton it would
       * have prerendered, at the edge, in single-digit milliseconds. What makes
       * the app feel instant is that the data comes from Zero's local store
       * rather than the network, and that is unaffected.
       */
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
        wrangler: {
          // Without this Nitro derives the Worker name from the repo
          // ("yekta-lexeme") and `wrangler deploy` creates a second Worker
          // beside the one the dashboard made. Must match the project name.
          name: "lexeme",
          /**
           * Keep the environment variables configured in the dashboard.
           *
           * Wrangler treats its config as the source of truth, "like a
           * terraform file" — so a deploy whose config has no `vars` block
           * *deletes* every plain variable set in the dashboard. Nitro
           * generates exactly such a config, so every deploy was silently
           * wiping the app's configuration and the Worker came back up with an
           * empty `process.env`: `/api/auth/get-session` 500s on the first
           * request because env validation finds nothing.
           *
           * Secrets are unaffected either way — Wrangler never deletes those.
           * This only protects anything stored as a plain Variable.
           */
          keep_vars: true,
        },
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
