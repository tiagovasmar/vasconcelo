import { realCatalog } from "../src/content/catalog";
import { createBackup } from "../src/db/backup";
import { scriptDb, scriptUrl } from "./lib/env";
import { getStore, supabaseStorageConfig } from "../src/server/storage";
import { systemFlags } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { initializeStockToZero, STOCK_INIT_FLAG } from "../src/features/catalog/overrides";

// Inicialización ÚNICA del stock propio en 0 para todas las fichas actuales (no retiradas), con respaldo previo y registro en el historial.
//   npm run stock:inicializar            → muestra qué haría (no escribe)
//   npm run stock:inicializar -- --write → hace el respaldo en .local/backups y aplica (una sola vez: queda marcada en la base)
// Solo cambia stock «pendiente»: no baja cantidades positivas ni toca precios, fotos, títulos o visibilidad. Volver a ejecutarla no hace nada.
const write = process.argv.includes("--write");
async function main() {
  const db = scriptDb();
  const [done] = await db.select().from(systemFlags).where(eq(systemFlags.key, STOCK_INIT_FLAG));
  if (done) {
    console.log(`Ya aplicada el ${new Date(done.appliedAt).toLocaleString("es-AR")} (${done.note ?? ""}). No se cambia nada.`);
    return;
  }
  if (!write) {
    console.log("Solo revisión: agregá --write para respaldar la base y aplicar la inicialización (una sola vez).");
    return;
  }
  const copia = await createBackup({ url: scriptUrl(), dir: ".local/backups", store: supabaseStorageConfig() ? getStore() : null, label: "tienda" });
  console.log(`Respaldo recuperable: ${copia.path}  (se restaura con npm run db:restore)`);
  const r = await initializeStockToZero(db, realCatalog.products, { id: "inicializacion-stock", email: "script:stock-inicial-cero" });
  console.log(r.applied ? `Stock inicial en 0 aplicado a ${r.updated} fichas.` : "Ya estaba aplicada.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
