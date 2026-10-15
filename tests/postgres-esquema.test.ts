import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TABLES } from "@/db/portable";
import { buildLegacySqlite } from "./helpers/legacy-sqlite";
import { openTestDb } from "./helpers/pg";

/**
 * El esquema PostgreSQL debe ser EQUIVALENTE al SQLite original: mismas tablas, mismas columnas, mismas claves únicas, relaciones (con su borrado en cascada)
 * e índices. Se compara contra el SQLite que se arma de verdad con las migraciones originales (`drizzle-sqlite-legacy/`).
 */
let dir: string;
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "esquema-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("esquema PostgreSQL equivalente al SQLite original", () => {
  it("mismas tablas y mismas columnas (nombres)", async () => {
    const lite = buildLegacySqlite(path.join(dir, "legacy.db"));
    const liteTables = (lite.prepare("select name from sqlite_master where type='table' and name not like '\\_\\_%' escape '\\' and name not like 'sqlite_%'").all() as Array<{ name: string }>).map((t) => t.name).sort();
    const db = await openTestDb();
    const pgTables = ((await db.execute(sql`select table_name from information_schema.tables where table_schema='public' order by 1`)) as unknown as Array<{ table_name: string }>).map((r) => r.table_name).sort();
    expect(pgTables).toEqual(liteTables);
    expect(TABLES.map((t) => t.name).sort()).toEqual(liteTables); // la lista de tablas de respaldo/migración cubre todas
    for (const t of liteTables) {
      const liteCols = (lite.prepare(`pragma table_info("${t}")`).all() as Array<{ name: string; notnull: number }>).map((c) => c.name).sort();
      const pgCols = ((await db.execute(sql`select column_name from information_schema.columns where table_schema='public' and table_name=${t}`)) as unknown as Array<{ column_name: string }>).map((c) => c.column_name).sort();
      expect(pgCols, t).toEqual(liteCols);
    }
    lite.close();
  });

  it("mismas columnas obligatorias (NOT NULL) y mismas claves primarias", async () => {
    const lite = buildLegacySqlite(path.join(dir, "legacy2.db"));
    const db = await openTestDb();
    for (const t of TABLES.map((x) => x.name)) {
      const info = lite.prepare(`pragma table_info("${t}")`).all() as Array<{ name: string; notnull: number; pk: number }>;
      const liteNotNull = info.filter((c) => c.notnull === 1 || c.pk > 0).map((c) => c.name).sort();
      const pgNotNull = ((await db.execute(sql`select column_name from information_schema.columns where table_schema='public' and table_name=${t} and is_nullable='NO'`)) as unknown as Array<{ column_name: string }>).map((c) => c.column_name).sort();
      expect(pgNotNull, `NOT NULL de ${t}`).toEqual(liteNotNull);
      const pk = ((await db.execute(sql`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=${`public."${t}"`}::regclass and i.indisprimary`)) as unknown as Array<{ attname: string }>).map((r) => r.attname).sort();
      expect(pk, `PK de ${t}`).toEqual(info.filter((c) => c.pk > 0).map((c) => c.name).sort());
    }
    lite.close();
  });

  it("mismas claves únicas, índices y relaciones con borrado en cascada", async () => {
    const lite = buildLegacySqlite(path.join(dir, "legacy3.db"));
    const db = await openTestDb();
    for (const t of TABLES.map((x) => x.name)) {
      const idx = lite.prepare(`pragma index_list("${t}")`).all() as Array<{ name: string; unique: number; origin: string }>;
      const liteIdx = idx.filter((i) => i.origin !== "pk").map((i) => ({ cols: (lite.prepare(`pragma index_info("${i.name}")`).all() as Array<{ name: string }>).map((c) => c.name).join(","), unique: i.unique === 1 })).sort((a, b) => a.cols.localeCompare(b.cols));
      const pgRows = (await db.execute(sql`select i.indisunique as uniq, array_to_string(array(select a.attname from unnest(i.indkey) with ordinality k(n,o) join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.n order by k.o), ',') as cols from pg_index i where i.indrelid=${`public."${t}"`}::regclass and not i.indisprimary`)) as unknown as Array<{ uniq: boolean; cols: string }>;
      const pgIdx = pgRows.map((r) => ({ cols: r.cols, unique: r.uniq })).sort((a, b) => a.cols.localeCompare(b.cols));
      expect(pgIdx, `índices de ${t}`).toEqual(liteIdx);
      const fks = (lite.prepare(`pragma foreign_key_list("${t}")`).all() as Array<{ from: string; table: string; to: string; on_delete: string }>).map((f) => `${f.from}->${f.table}.${f.to}:${f.on_delete.toLowerCase()}`).sort();
      const pgFks = ((await db.execute(sql`select kcu.column_name as c, ccu.table_name as t, ccu.column_name as r, rc.delete_rule as d from information_schema.table_constraints tc join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name where tc.constraint_type='FOREIGN KEY' and tc.table_name=${t} and tc.table_schema='public'`)) as unknown as Array<{ c: string; t: string; r: string; d: string }>).map((f) => `${f.c}->${f.t}.${f.r}:${f.d.toLowerCase()}`).sort();
      expect(pgFks, `relaciones de ${t}`).toEqual(fks);
    }
    lite.close();
  });

  it("los tiempos en milisegundos y los importes caben (bigint) y la identidad es por defecto (admite ids explícitos)", async () => {
    const db = await openTestDb();
    const types = ((await db.execute(sql`select table_name||'.'||column_name as c, data_type as t from information_schema.columns where table_schema='public' and (column_name like '%_at' or column_name like '%minor' or column_name like '%10k') and table_name not in ('user','session','account','verification')`)) as unknown as Array<{ c: string; t: string }>);
    const bad = types.filter((x) => x.t !== "bigint" && !x.c.startsWith("inquiry_lines.unit_price_usd_minor") && !x.c.startsWith("product_overrides.price_usd_minor"));
    expect(bad).toEqual([]);
    const idt = ((await db.execute(sql`select table_name as t, is_identity as i, identity_generation as g from information_schema.columns where table_schema='public' and is_identity='YES' order by 1`)) as unknown as Array<{ t: string; g: string }>);
    expect(idt.map((x) => x.t)).toEqual(["fx_log", "inquiry_lines", "product_audit"]);
    expect(idt.every((x) => x.g === "BY DEFAULT")).toBe(true);
  });
});
