import path from "node:path";
import { createBackup, pruneBackups } from "../src/db/backup";
import { describeTarget, scriptUrl } from "./lib/env";
import { getStore, supabaseStorageConfig } from "../src/server/storage";

// Respaldo consistente de la base PostgreSQL y de las fotos de Storage, en una carpeta. Variables: DIRECT_URL (origen), BACKUP_DIR (destino,
// por defecto ./backups), BACKUP_KEEP (cuántos respaldos conservar; vacío = todos). Opciones: --sin-fotos, --con-sesiones.
async function main() {
  const args = process.argv.slice(2);
  const url = scriptUrl();
  const dir = path.resolve(process.env.BACKUP_DIR || "backups");
  const withPhotos = !args.includes("--sin-fotos");
  try {
    if (withPhotos && !supabaseStorageConfig() && process.env.STORAGE_DRIVER !== "local") console.warn("Aviso: no hay Supabase Storage configurado (SUPABASE_URL / SUPABASE_SECRET_KEY): el respaldo NO incluirá fotos. Usá --sin-fotos para silenciar este aviso.");
    const { path: out, manifest } = await createBackup({ url, dir, store: withPhotos && (supabaseStorageConfig() || process.env.STORAGE_DRIVER === "local") ? getStore() : null, withVolatile: args.includes("--con-sesiones") });
    console.log(`Origen: ${describeTarget(url)}`);
    console.log(`Respaldo creado y verificado: ${out}`);
    console.log(`Tablas: ${Object.entries(manifest.tables).map(([t, v]) => `${t}=${v.rows}`).join(", ")} · fotos: ${manifest.storage.length}`);
    const keep = Number(process.env.BACKUP_KEEP || 0);
    if (keep > 0) {
      const removed = pruneBackups(dir, keep);
      if (removed.length) console.log(`Se eliminaron ${removed.length} respaldo(s) antiguo(s); se conservan los ${keep} más recientes.`);
    }
    console.log("Guardá una copia FUERA de este equipo: una copia en el mismo disco no protege de una falla del disco. El plan gratuito de Supabase no incluye respaldos descargables.");
  } catch (e) {
    console.error(`No se pudo crear el respaldo: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
void main();
