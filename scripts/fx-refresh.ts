import { scriptDb } from "./lib/env";
import { formatRate } from "../src/features/fx/convert";
import { getEffectiveRate, providerUrl, refreshRate } from "../src/features/fx/service";

// Consulta ahora la cotización del dólar blue (venta) y la guarda en la base local.
//   npm run fx:refresh
// Sirve para una tarea programada externa (cron / Programador de tareas / GitHub Actions) si querés mantener la cotización al día aunque no haya visitas.
async function main() {
  const db = scriptDb();
  console.log(`Proveedor: ${providerUrl()}`);
  const r = await refreshRate(db, { force: true, fetchFn: fetch as never });
  if (r.skipped) console.log(`Omitido: ${r.reason}`);
  else if (r.ok) console.log(`OK. ${r.changed ? "Cambió" : "Sin cambios"}. Cotización: ${formatRate(r.rate10k)}`);
  else console.error(`ERROR: ${r.error}\nSe conserva la última cotización válida.`);
  const fx = await getEffectiveRate(db);
  console.log(`Vigente: ${fx.rate10k ? formatRate(fx.rate10k) : "ninguna"} · modo ${fx.mode} · estado ${fx.status}`);
  process.exitCode = r.skipped || r.ok ? 0 : 1;
  await db.$client.end({ timeout: 5 });
}
void main();
