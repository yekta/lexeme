import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Keep dev on :3000 so BETTER_AUTH_URL and the Google OAuth redirect URIs
  // (configured for localhost:3000) stay valid.
  server: { port: 3000 },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  // wa-sqlite ships its own worker + wasm; let Vite serve them untouched.
  optimizeDeps: {
    exclude: ["@tanstack/browser-db-sqlite-persistence"],
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
