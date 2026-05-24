import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  globalIgnores([
    "node_modules/**",
    ".output/**",
    "dist/**",
    ".vinxi/**",
    ".vite/**",
    "src/routeTree.gen.ts",
  ]),
]);

export default eslintConfig;
