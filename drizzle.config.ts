import { defineConfig } from "drizzle-kit";

// Migraciones de PostgreSQL. Las del SQLite original quedaron en `drizzle-sqlite-legacy/` (solo referencia; no se aplican).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgres://localhost/unused" },
});
