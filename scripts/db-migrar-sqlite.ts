import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { executeMigration, openSourceCopy, planMigration } from "../src/db/sqlite-import";
import { describeTarget, isLocalTarget, scriptUrl } from "./lib/env";
import { getStore, supabaseStorageConfig } from "../src/server/storage";

const UPLOAD_NAME = /^[a-f0-9]{24}(-t)?.webp$/; // mismo patrón que src/server/media.ts (ese módulo es solo para el servidor web)

/**
 * Migra la base SQLite original (y las fotos subidas) a PostgreSQL + Storage. Con REVISIÓN PREVIA y ejecución explícita.
 *
 *   npm run db:migrar-sqlite -- --origen .local/backups/pre-postgres/tienda-AAAAMMDD-HHMMSS.db --uploads .local/backups/pre-postgres/uploads
 *       → solo revisa: qué filas faltan en el destino y cuáles ya existen. No escribe nada.
 *   ... --ejecutar
 *       → inserta lo que falta (nunca pisa lo que ya está en el destino) y verifica fila por fila.
 *
 * Destino: DIRECT_URL (o DATABASE_URL) del entorno / .env.local. Si el destino NO es esta computadora hay que agregar --destino-publico:
 * migrá primero a una base de prueba y recién después, con el visto bueno del dueño, a la definitiva.
 * Opciones: --incluir-sesiones (por defecto NO se migran sesiones ni tokens: expiran y se piden de nuevo al ingresar).
 */
async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(n);
  const val = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const origen = val("--origen");
  const uploads = val("--uploads");
  const execute = flag("--ejecutar");
  const withVolatile = flag("--incluir-sesiones");
  if (!origen) { console.error("Indicá el archivo SQLite de origen con --origen <archivo.db> (usá una COPIA, p. ej. la de .local/backups)."); process.exit(1); }
  const url = scriptUrl();
  const target = describeTarget(url);
  if (execute && !isLocalTarget(url) && !flag("--destino-publico")) {
    console.error(`El destino (${target}) no es esta computadora. Para escribir ahí agregá --destino-publico. Recomendado: probar antes contra una base de prueba.`);
    process.exit(1);
  }
  console.log(`Origen : ${path.resolve(origen)} (se lee una copia; el original no se toca)`);
  console.log(`Destino: ${target}`);
  const src = await openSourceCopy(path.resolve(origen));
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined, ssl: isLocalTarget(url) || process.env.DATABASE_SSL === "disable" ? false : "require" });
  let failed = false;
  try {
    const plan = await planMigration(sql, src.db, withVolatile);
    console.log("\nRevisión previa (cantidades; no se muestran datos):");
    console.log("tabla".padEnd(22) + "origen".padStart(8) + "destino".padStart(9) + "a insertar".padStart(12) + "ya iguales".padStart(12) + "ya distintas".padStart(14));
    for (const p of plan) console.log(p.table.padEnd(22) + String(p.inSource).padStart(8) + String(p.inTarget).padStart(9) + String(p.toInsert).padStart(12) + String(p.alreadyIdentical).padStart(12) + String(p.alreadyDifferent).padStart(14) + (p.missingInSource ? "  (no existe en el origen)" : ""));
    const diff = plan.reduce((n, p) => n + p.alreadyDifferent, 0);
    if (diff) console.log(`\n${diff} fila(s) ya existen en el destino con valores distintos: se CONSERVAN las del destino (pueden ser cambios posteriores del administrador).`);

    // Fotos
    const store = supabaseStorageConfig() || process.env.STORAGE_DRIVER === "local" ? getStore() : null;
    const files = uploads && fs.existsSync(uploads) ? fs.readdirSync(uploads).filter((f) => UPLOAD_NAME.test(f)) : [];
    let toUpload = 0;
    if (uploads) {
      if (!store) console.log("\nFotos: hay --uploads pero no hay Storage configurado (SUPABASE_URL / SUPABASE_SECRET_KEY): no se pueden migrar.");
      else {
        for (const f of files) if (!(await store.exists(f))) toUpload++;
        console.log(`\nFotos: ${files.length} archivo(s) en la carpeta; ${toUpload} faltan en Storage (${files.length - toUpload} ya están).`);
      }
    }
    const mediaIds = (src.db.prepare("select id from media_assets").all() as Array<{ id: string }>).map((r) => r.id);
    const missingLocal = mediaIds.filter((id) => !files.includes(id));
    if (mediaIds.length) console.log(`Fotos registradas en la base de origen: ${mediaIds.length}; sin archivo en la carpeta indicada: ${uploads ? missingLocal.length : "(no se indicó --uploads)"}.`);

    if (!execute) {
      console.log("\nRevisión previa terminada: NO se escribió nada. Para migrar de verdad repetí el comando agregando --ejecutar.");
      return;
    }
    const res = await executeMigration(sql, src.db, withVolatile);
    console.log("\nMigración ejecutada (en una sola transacción). Filas insertadas:");
    console.log("  " + Object.entries(res.inserted).map(([t, n]) => `${t}=${n}`).join(", "));
    console.log("\nVerificación fila por fila:");
    for (const v of res.verification) {
      console.log(`  ${v.ok ? "OK " : "MAL"} ${v.table.padEnd(22)} origen=${v.sourceRows} iguales=${v.matched} conservadas-distintas=${v.preservedDifferent}`);
      if (!v.ok) failed = true;
    }
    if (store && files.length) {
      let up = 0, bad = 0;
      for (const f of files) {
        const data = fs.readFileSync(path.join(uploads!, f));
        await store.put(f, data, "image/webp");
        const back = await store.get(f);
        if (!back || crypto.createHash("sha256").update(back).digest("hex") !== crypto.createHash("sha256").update(data).digest("hex")) bad++;
        else up++;
      }
      console.log(`\nFotos verificadas en Storage: ${up} OK, ${bad} con diferencias.`);
      if (bad) failed = true;
    }
  } finally {
    src.cleanup();
    await sql.end({ timeout: 5 });
  }
  if (failed) { console.error("\nHubo diferencias: revisá el detalle de arriba antes de seguir."); process.exit(1); }
  if (execute) console.log("\nListo. Repetir este comando es seguro: no duplica ni pisa datos.");
}

main().catch((e) => {
  console.error(`Falló la migración: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
