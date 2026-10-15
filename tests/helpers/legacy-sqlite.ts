import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/** Construye una base SQLite con el esquema ORIGINAL (las migraciones de `drizzle-sqlite-legacy/`, en orden), para probar la migración a PostgreSQL. */
export function buildLegacySqlite(file: string): Database.Database {
  const dir = path.resolve("drizzle-sqlite-legacy");
  const db = new Database(file);
  db.pragma("foreign_keys = ON");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const stmt of fs.readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) db.exec(stmt);
  }
  return db;
}
