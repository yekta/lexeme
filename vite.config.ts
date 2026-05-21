import path from "node:path";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3000 },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  optimizeDeps: {
    exclude: ["@tanstack/browser-db-sqlite-persistence"],
  },
  plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
});
