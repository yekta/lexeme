import { cp, rm } from "node:fs/promises";
import { build } from "esbuild";

// Bundle the server — workspace packages included — into one ESM file, so the
// deployed image needs almost no node_modules. The createRequire banner keeps
// any stray require() from a bundled CJS dependency working under ESM.
await rm("dist", { recursive: true, force: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  sourcemap: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});

// The migrations live in @lexeme/db and are read at runtime rather than
// bundled, so they have to travel with the output. They land beside dist/,
// which is the first place src/index.ts looks.
await rm("drizzle", { recursive: true, force: true });
await cp("../../packages/db/drizzle", "drizzle", { recursive: true });
