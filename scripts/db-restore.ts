import path from "node:path";
import { restoreBackup, verifyBackup } from "../src/db/backup";
import { describeTarget, scriptUrl } from "./lib/env";
import { getStore, supabaseStorageConfig } from "../src/server/storage";

// Uso: npm run db:restore -- backups/tienda-AAAAMMDD-HHMMSS --yes [--reemplazar]
// Restaura en la base de DIRECT_URL (y las fotos en Storage). Por defecto el destino debe estar vacío (recién migrado); con --reemplazar se vacían
// las tablas de la tienda. Antes se guarda un respaldo de seguridad (pre-restauracion-*). Ojo: apuntá DIRECT_URL a una base DESCARTABLE para probar.
async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith("--"));
  const confirmed = args.includes("--yes");
  const url = scriptUrl();
  const safetyDir = path.resolve(process.env.BACKUP_DIR || "backups");
  if (!dirArg) {
    console.error("Indicá la carpeta del respaldo. Ej.: npm run db:restore -- backups/tienda-20261012-103000 --yes");
    process.exit(1);
  }
  const backupDir = path.resolve(dirArg);
  const problems = verifyBackup(backupDir);
  if (problems.length) {
    console.error(`No se restauró nada: el respaldo no es válido: ${problems.join("; ")}`);
    process.exit(1);
  }
  if (!confirmed) {
    console.error(`Esto restaura ${backupDir} en ${describeTarget(url)}${args.includes("--reemplazar") ? " REEMPLAZANDO los datos actuales" : " (el destino debe estar vacío)"}.\nSe guarda antes un respaldo de seguridad. Para continuar repetí el comando agregando --yes.`);
    process.exit(1);
  }
  try {
    const useStore = supabaseStorageConfig() || process.env.STORAGE_DRIVER === "local";
    const r = await restoreBackup({ backupDir, url, store: useStore ? getStore() : null, replace: args.includes("--reemplazar"), safetyDir });
    console.log(`Base restaurada y verificada: ${describeTarget(url)}`);
    console.log(`Filas insertadas: ${Object.entries(r.rows).map(([t, n]) => `${t}=${n}`).join(", ")} · fotos: ${r.photos}`);
    if (r.safety) console.log(`Respaldo de seguridad del destino anterior: ${r.safety}`);
  } catch (e) {
    console.error(`No se restauró nada: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
void main();
