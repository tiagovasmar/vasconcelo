import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { runMigrations } from "./client";
import { columnsOf, dataTables, fingerprint, insertRows, readTable, resetIdentity, TABLES, toJsonRow, type Column } from "./portable";

/**
 * Respaldo y restauración de PostgreSQL (Supabase) + fotos de Storage.
 *
 * Un respaldo es una CARPETA `tienda-AAAAMMDD-HHMMSS/` con:
 *  - `manifest.json`: formato, fecha, por tabla (columnas, cantidad de filas, huella SHA-256) y por foto (tamaño y SHA-256);
 *  - `data/<tabla>.ndjson`: una fila JSON por línea;
 *  - `storage/<nombre>`: las fotos subidas desde el panel (solo si hay un almacén de fotos).
 * Las filas se leen dentro de UNA transacción de solo lectura con aislamiento REPEATABLE READ: la copia es consistente aunque el sitio esté recibiendo escrituras.
 * Exportar filas por sí solo NO cubre los archivos: por eso las fotos viajan en el mismo respaldo y se verifican por huella.
 * No incluye sesiones, tokens de un solo uso ni contadores de límite (datos volátiles) salvo pedido expreso.
 */
export const BACKUP_FORMAT = "tienda-backup/1";

export type PhotoStore = { list(): Promise<string[]>; get(name: string): Promise<Buffer | null>; put(name: string, data: Buffer, contentType: string): Promise<{ created: boolean }> };

export type Manifest = {
  format: typeof BACKUP_FORMAT;
  createdAt: string;
  volatileIncluded: boolean;
  migrationsApplied: number;
  tables: Record<string, { columns: Column[]; rows: number; sha256: string }>;
  storage: Array<{ name: string; bytes: number; sha256: string }>;
};

export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const open = (url: string) => postgres(url, { max: 1, prepare: false, onnotice: () => undefined, ssl: /^(localhost|127\.0\.0\.1|\[::1\])$/.test(new URL(url).hostname) || process.env.DATABASE_SSL === "disable" ? false : "require" });

/** Crea el respaldo. Devuelve la carpeta creada y su manifiesto. */
export async function createBackup(opts: { url: string; dir: string; store?: PhotoStore | null; withVolatile?: boolean; label?: string; now?: Date }): Promise<{ path: string; manifest: Manifest }> {
  const dest = path.join(opts.dir, `${opts.label ?? "tienda"}-${timestamp(opts.now)}`);
  if (fs.existsSync(dest)) throw new Error(`Ya existe ${dest}`);
  fs.mkdirSync(path.join(dest, "data"), { recursive: true });
  const sql = open(opts.url);
  const tables: Manifest["tables"] = {};
  let migrationsApplied = 0;
  try {
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const mig = await tx.unsafe(`select count(*)::int as n from drizzle.__drizzle_migrations`).catch(() => [{ n: 0 }]);
      migrationsApplied = Number((mig as unknown as Array<{ n: number }>)[0]?.n ?? 0);
      for (const spec of dataTables(opts.withVolatile)) {
        const cols = await columnsOf(tx as unknown as postgres.Sql, spec.name);
        // Una tabla opcional (agregada en una migración posterior) que todavía no existe se omite: así se puede respaldar una base antes de migrarla.
        if (!cols.length && spec.optional) continue;
        if (!cols.length) throw new Error(`Falta la tabla ${spec.name}: ¿se aplicaron las migraciones (npm run db:migrate)?`);
        const rows = await readTable(tx as unknown as postgres.Sql, spec.name);
        fs.writeFileSync(path.join(dest, "data", `${spec.name}.ndjson`), rows.map((r) => JSON.stringify(toJsonRow(r))).join("\n") + (rows.length ? "\n" : ""));
        tables[spec.name] = { columns: cols, ...fingerprint(spec, cols, rows) };
      }
    });
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  } finally {
    await sql.end({ timeout: 5 });
  }
  const storage: Manifest["storage"] = [];
  if (opts.store) {
    fs.mkdirSync(path.join(dest, "storage"), { recursive: true });
    for (const name of (await opts.store.list()).sort()) {
      const data = await opts.store.get(name);
      if (!data) continue; // desapareció mientras tanto
      fs.writeFileSync(path.join(dest, "storage", name), data);
      storage.push({ name, bytes: data.length, sha256: sha(data) });
    }
  }
  const manifest: Manifest = { format: BACKUP_FORMAT, createdAt: (opts.now ?? new Date()).toISOString(), volatileIncluded: Boolean(opts.withVolatile), migrationsApplied, tables, storage };
  fs.writeFileSync(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2));
  const problems = verifyBackup(dest);
  if (problems.length) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw new Error(`El respaldo no pasó la verificación: ${problems.join("; ")}`);
  }
  return { path: dest, manifest };
}

/** Lee y valida un respaldo sin tocar ninguna base. Devuelve los problemas (vacío = íntegro). */
export function verifyBackup(dir: string): string[] {
  const problems: string[] = [];
  let manifest: Manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return [`No se pudo leer ${path.join(dir, "manifest.json")}: no es un respaldo de esta tienda.`];
  }
  if (manifest.format !== BACKUP_FORMAT) return [`Formato desconocido (${String(manifest.format)}).`];
  for (const spec of TABLES) {
    const t = manifest.tables[spec.name];
    if (!t) {
      if (!spec.volatile && !spec.optional) problems.push(`falta la tabla ${spec.name}`);
      continue;
    }
    let rows: Array<Record<string, unknown>>;
    try {
      const text = fs.readFileSync(path.join(dir, "data", `${spec.name}.ndjson`), "utf8");
      rows = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
    } catch {
      problems.push(`no se puede leer data/${spec.name}.ndjson`);
      continue;
    }
    const fp = fingerprint(spec, t.columns, rows);
    if (fp.rows !== t.rows || fp.sha256 !== t.sha256) problems.push(`la tabla ${spec.name} no coincide con el manifiesto (${fp.rows} filas leídas, ${t.rows} esperadas)`);
  }
  for (const f of manifest.storage) {
    try {
      const data = fs.readFileSync(path.join(dir, "storage", f.name));
      if (data.length !== f.bytes || sha(data) !== f.sha256) problems.push(`la foto ${f.name} está alterada`);
    } catch {
      problems.push(`falta la foto ${f.name}`);
    }
  }
  return problems;
}

export const readManifest = (dir: string): Manifest => JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as Manifest;

/** Borra los respaldos más antiguos y deja los `keep` más recientes (solo carpetas `tienda-AAAAMMDD-HHMMSS` de ese directorio). */
export function pruneBackups(dir: string, keep: number): string[] {
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((f) => /^tienda-\d{8}-\d{6}$/.test(f) && fs.statSync(path.join(dir, f)).isDirectory()).sort();
  const old = names.slice(0, Math.max(0, names.length - keep));
  for (const f of old) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  return old;
}

export type RestoreResult = { safety: string | null; manifest: Manifest; rows: Record<string, number>; photos: number };

/**
 * Restaura un respaldo. Antes verifica el respaldo y guarda un respaldo de seguridad del destino (`pre-restauracion-*`).
 * Por defecto el destino debe estar vacío (recién migrado): con `replace` se vacían las tablas de la tienda primero.
 * Al terminar vuelve a leer el destino y compara cada tabla y cada foto con el manifiesto; si algo no coincide, falla.
 */
export async function restoreBackup(opts: { backupDir: string; url: string; store?: PhotoStore | null; replace?: boolean; safetyDir: string; now?: Date }): Promise<RestoreResult> {
  const problems = verifyBackup(opts.backupDir);
  if (problems.length) throw new Error(`El respaldo no es válido: ${problems.join("; ")}`);
  const manifest = readManifest(opts.backupDir);
  await runMigrations(opts.url); // idempotente: deja el esquema al día sin tocar datos
  const sql = open(opts.url);
  try {
    const present: string[] = [];
    for (const spec of dataTables(false)) {
      const [r] = await sql.unsafe(`select count(*)::int as n from "${spec.name}"`);
      if (Number((r as unknown as { n: number }).n) > 0) present.push(spec.name);
    }
    if (present.length && !opts.replace) throw new Error(`El destino no está vacío (${present.join(", ")}). Para reemplazarlo usá --reemplazar (antes se guarda un respaldo de seguridad).`);
  } finally {
    await sql.end({ timeout: 5 });
  }
  const safety = await createBackup({ url: opts.url, dir: opts.safetyDir, store: opts.store ?? null, label: "pre-restauracion", now: opts.now }).then((b) => b.path);

  const target = open(opts.url);
  const rows: Record<string, number> = {};
  try {
    await target.begin(async (tx) => {
      const t = tx as unknown as postgres.Sql;
      if (opts.replace) await t.unsafe(`truncate table ${TABLES.map((s) => `"${s.name}"`).join(", ")} restart identity cascade`);
      for (const spec of TABLES) {
        const m = manifest.tables[spec.name];
        if (!m) continue;
        const text = fs.readFileSync(path.join(opts.backupDir, "data", `${spec.name}.ndjson`), "utf8");
        const data = text.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>);
        rows[spec.name] = await insertRows(t, spec, m.columns, data);
        await resetIdentity(t, spec);
      }
    });
    // Verificación posterior: cada tabla del destino debe tener exactamente la huella del respaldo.
    for (const spec of TABLES) {
      const m = manifest.tables[spec.name];
      if (!m) continue;
      const fp = fingerprint(spec, m.columns, await readTable(target, spec.name));
      if (fp.rows !== m.rows || fp.sha256 !== m.sha256) throw new Error(`Tras restaurar, la tabla ${spec.name} no coincide con el respaldo (${fp.rows}/${m.rows} filas).`);
    }
  } finally {
    await target.end({ timeout: 5 });
  }
  let photos = 0;
  if (opts.store && manifest.storage.length) {
    for (const f of manifest.storage) {
      const data = fs.readFileSync(path.join(opts.backupDir, "storage", f.name));
      await opts.store.put(f.name, data, "image/webp");
      const back = await opts.store.get(f.name);
      if (!back || sha(back) !== f.sha256) throw new Error(`Tras restaurar, la foto ${f.name} no coincide con el respaldo.`);
      photos++;
    }
  }
  return { safety, manifest, rows, photos };
}
