import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";
import { canonical, columnsOf, dataTables, fingerprint, insertRows, readTable, resetIdentity, TABLES, type Column, type TableSpec } from "./portable";

/**
 * Migración desde la base SQLite original a PostgreSQL, con revisión previa.
 *  - El archivo de origen NUNCA se modifica: se lo copia (API de respaldo de SQLite) a una carpeta temporal y se lee de esa copia.
 *  - `plan` solo lee: cuenta filas, detecta cuáles faltan en el destino y cuáles ya existen (iguales o distintas). No escribe nada.
 *  - `execute` inserta únicamente las filas que faltan (`ON CONFLICT DO NOTHING`): repetirla no duplica ni pisa lo que el administrador cambió después.
 *    Todo ocurre en UNA transacción: o se migra todo o no se migra nada.
 *  - Después compara, tabla por tabla, cada fila de origen con la del destino (huella SHA-256 de las filas canónicas).
 * Nada de lo que se imprime incluye valores de filas (hay datos de cuentas): solo nombres de tablas y cantidades.
 */
export type TablePlan = {
  table: string;
  inSource: number;
  inTarget: number;
  toInsert: number;
  alreadyIdentical: number;
  alreadyDifferent: number;
  missingInSource: boolean;
};

export type SourceHandle = { db: Database.Database; cleanup: () => void };

/** Abre una COPIA de solo lectura del SQLite de origen. */
export async function openSourceCopy(file: string): Promise<SourceHandle> {
  if (!fs.existsSync(file)) throw new Error(`No existe el archivo de origen: ${file}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tienda-origen-"));
  const copy = path.join(dir, "origen.db");
  const src = new Database(file, { readonly: true, fileMustExist: true });
  try {
    await src.backup(copy);
  } finally {
    src.close();
  }
  const db = new Database(copy, { readonly: true, fileMustExist: true });
  return { db, cleanup: () => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

/** Convierte un valor de SQLite al tipo de la columna de PostgreSQL (0/1 → boolean, milisegundos → timestamptz). */
export function convertValue(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (type === "boolean") return v === 1 || v === true || v === "1";
  if (type === "timestamp with time zone" || type === "timestamp without time zone") return new Date(Number(v)).toISOString();
  return v;
}

function sourceRows(src: Database.Database, spec: TableSpec, cols: Column[]): { rows: Array<Record<string, unknown>>; present: boolean; usable: Column[] } {
  const exists = src.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(spec.name);
  if (!exists) return { rows: [], present: false, usable: cols };
  const have = new Set((src.prepare(`pragma table_info("${spec.name}")`).all() as Array<{ name: string }>).map((c) => c.name));
  const usable = cols.filter((c) => have.has(c.name));
  const raw = src.prepare(`select ${usable.map((c) => `"${c.name}"`).join(", ")} from "${spec.name}"`).all() as Array<Record<string, unknown>>;
  const rows = raw.map((r) => Object.fromEntries(usable.map((c) => [c.name, convertValue(c.type, r[c.name])])));
  return { rows, present: true, usable };
}

const keyOf = (spec: TableSpec, cols: Column[], r: Record<string, unknown>) => spec.pk.map((k) => canonical(cols.find((c) => c.name === k)!.type, r[k]) ?? "").join("\u0001");
const lineOf = (cols: Column[], r: Record<string, unknown>) => JSON.stringify(cols.map((c) => canonical(c.type, r[c.name])));

export async function planMigration(sql: postgres.Sql, src: Database.Database, withVolatile = false): Promise<TablePlan[]> {
  const plan: TablePlan[] = [];
  for (const spec of dataTables(withVolatile)) {
    const cols = await columnsOf(sql, spec.name);
    if (!cols.length) throw new Error(`El destino no tiene la tabla ${spec.name}: corré primero npm run db:migrate sobre el destino.`);
    const s = sourceRows(src, spec, cols);
    const target = await readTable(sql, spec.name);
    const targetByKey = new Map(target.map((r) => [keyOf(spec, cols, r), lineOf(s.usable, r)]));
    let toInsert = 0, same = 0, diff = 0;
    for (const r of s.rows) {
      const t = targetByKey.get(keyOf(spec, cols, r));
      if (t === undefined) toInsert++;
      else if (t === lineOf(s.usable, r)) same++;
      else diff++;
    }
    plan.push({ table: spec.name, inSource: s.rows.length, inTarget: target.length, toInsert, alreadyIdentical: same, alreadyDifferent: diff, missingInSource: !s.present });
  }
  return plan;
}

export type ExecuteResult = { inserted: Record<string, number>; verification: Array<{ table: string; ok: boolean; sourceRows: number; matched: number; preservedDifferent: number }> };

export async function executeMigration(sql: postgres.Sql, src: Database.Database, withVolatile = false): Promise<ExecuteResult> {
  const inserted: Record<string, number> = {};
  const plans = await planMigration(sql, src, withVolatile); // vuelve a calcular justo antes de escribir
  await sql.begin(async (tx) => {
    const t = tx as unknown as postgres.Sql;
    for (const spec of dataTables(withVolatile)) {
      const cols = await columnsOf(t, spec.name);
      const s = sourceRows(src, spec, cols);
      inserted[spec.name] = await insertRows(t, spec, s.usable, s.rows);
      await resetIdentity(t, spec);
    }
  });
  const verification: ExecuteResult["verification"] = [];
  for (const spec of dataTables(withVolatile)) {
    const cols = await columnsOf(sql, spec.name);
    const s = sourceRows(src, spec, cols);
    const target = await readTable(sql, spec.name);
    const byKey = new Map(target.map((r) => [keyOf(spec, cols, r), r]));
    const planned = plans.find((p) => p.table === spec.name)!;
    // Subconjunto del destino que corresponde a filas de origen: debe ser idéntico, salvo las que ya existían distintas (se conservan).
    const mine = s.rows.map((r) => byKey.get(keyOf(spec, cols, r))).filter((r): r is Record<string, unknown> => Boolean(r));
    const identical = s.rows.filter((r) => { const t = byKey.get(keyOf(spec, cols, r)); return t && lineOf(s.usable, t) === lineOf(s.usable, r); });
    const okFp = fingerprint(spec, s.usable, mine).rows === s.rows.length;
    verification.push({ table: spec.name, ok: okFp && identical.length + planned.alreadyDifferent === s.rows.length, sourceRows: s.rows.length, matched: identical.length, preservedDifferent: planned.alreadyDifferent });
  }
  return { inserted, verification };
}

export { TABLES };
