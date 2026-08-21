import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.turbo/**",
    // Written by @tanstack/router-plugin on every build.
    "apps/web/src/routeTree.gen.ts",
  ]),
]);

export default eslintConfig;
