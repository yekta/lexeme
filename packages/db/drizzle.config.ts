import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit loads no .env of its own, so mirror what the server does: the
// package-local file first, then the repo root one, with anything already in
// the environment winning. Without this `db:generate` and `db:migrate` see a
// different DATABASE_URL from the app they belong to — or none at all.
for (const candidate of [".env", "../../.env"]) {
  if (existsSync(candidate)) process.loadEnvFile(candidate);
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
