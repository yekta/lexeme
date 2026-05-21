import { defineConfig, globalIgnores } from "eslint/config";

// Minimal flat config after the Next.js → TanStack Start migration.
// Type checking is enforced via `tsc --noEmit` (npm run typecheck).
export default defineConfig([
  globalIgnores([
    ".output/**",
    ".nitro/**",
    ".vite/**",
    ".tanstack/**",
    "dist/**",
    "drizzle/**",
    "src/routeTree.gen.ts",
  ]),
]);
