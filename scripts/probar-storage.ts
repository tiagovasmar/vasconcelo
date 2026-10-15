import crypto from "node:crypto";
import sharp from "sharp";
import { getStore, supabaseStorageConfig, DEFAULT_BUCKET } from "../src/server/storage";
import "./lib/env";

/**
 * Prueba REAL de Supabase Storage contra tu proyecto (necesita credenciales; por eso NO corre en la suite automática).
 * Usá un bucket DESCARTABLE (SUPABASE_STORAGE_BUCKET=prueba-fotos): sube, lista, descarga y compara una imagen, verifica que un repetido no se duplica,
 * y comprueba que SIN la clave secreta (solo con la clave pública «anon/publishable», si la definís en SUPABASE_PUBLISHABLE_KEY) NO se puede escribir.
 */
async function main() {
  const cfg = supabaseStorageConfig();
  if (!cfg) { console.error("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (en .env.local)."); process.exit(1); }
  if (cfg.bucket === DEFAULT_BUCKET && !process.argv.includes("--bucket-real")) {
    console.error(`Para no ensuciar el bucket real (${DEFAULT_BUCKET}) usá un bucket de prueba: SUPABASE_STORAGE_BUCKET=prueba-fotos. (Con --bucket-real se permite.)`);
    process.exit(1);
  }
  const store = getStore();
  const png = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: crypto.randomInt(255), g: 90, b: 60 } } }).webp().toBuffer();
  const name = `${crypto.createHash("sha256").update(png).digest("hex").slice(0, 24)}.webp`;
  const checks: Array<[string, boolean]> = [];
  const a = await store.put(name, png, "image/webp");
  checks.push(["subir un archivo nuevo", a.created]);
  const b = await store.put(name, png, "image/webp");
  checks.push(["subir el mismo archivo otra vez no lo duplica (created=false)", !b.created]);
  checks.push(["el archivo figura en la lista del bucket", (await store.list()).includes(name)]);
  const back = await store.get(name);
  checks.push(["descargar devuelve exactamente los mismos bytes", Boolean(back && back.equals(png))]);
  checks.push(["exists() lo encuentra", await store.exists(name)]);
  checks.push(["un nombre inexistente da null", (await store.get("0".repeat(24) + ".webp")) === null]);
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (pub) {
    const res = await fetch(`${cfg.url}/storage/v1/object/${cfg.bucket}/intruso-${Date.now()}.webp`, { method: "POST", headers: { apikey: pub, "Content-Type": "image/webp" }, body: new Uint8Array(png) });
    checks.push([`una subida con la clave pública es RECHAZADA (HTTP ${res.status})`, res.status === 400 || res.status === 401 || res.status === 403]);
  } else console.log("(Omitida la prueba de rechazo con clave pública: definí SUPABASE_PUBLISHABLE_KEY para hacerla.)");
  let bad = 0;
  for (const [label, ok] of checks) { console.log(`${ok ? "OK " : "MAL"} ${label}`); if (!ok) bad++; }
  console.log(bad ? `\n${bad} comprobación(es) fallaron.` : "\nStorage OK. Borrá a mano el archivo de prueba del bucket descartable si querés.");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error(`Falló: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
