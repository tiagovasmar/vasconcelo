// Prueba de INTEGRACIÓN del manejo de fallos de la cotización contra un build de producción real (no contra funciones sueltas):
// levanta un proveedor falso del dólar (puerto 4010) y `next start` (puerto 3410) con una COPIA de la base local (nunca la real), fuerza consultas
// (`/api/fx/refresh` con CRON_SECRET de prueba) con distintas respuestas y comprueba qué ve la tienda y qué guarda la base.
//   NEXT_DIST_DIR=.next-perf npx next build   →   node scripts/probar-cotizacion-fallos.mjs
// Escribe docs/cotizacion-fallos.json con los resultados. Sale con código 1 si algún escenario no se comporta como se espera.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import Database from "better-sqlite3";

const DIST = process.env.NEXT_DIST_DIR || ".next-perf";
const PORT = 3410;
const BASE = `http://localhost:${PORT}`;
const PROVIDER_PORT = 4010;
const DB = ".local/data/fx-prueba.db";
const SECRET = "secreto-de-prueba-solo-local-0123456789";
const PRODUCT = "/productos/abyss-eye-caja"; // USD 152 en la base copiada
const results = [];
const failures = [];
let mode = "ok";
let rate = 1500;

/* --------------------------------- proveedor falso --------------------------------- */
const provider = http.createServer((req, res) => {
  const blue = (venta, extra = {}) => JSON.stringify({ moneda: "USD", casa: "blue", nombre: "Blue", compra: venta - 20, venta, fechaActualizacion: new Date().toISOString(), ...extra });
  const send = (code, body, type = "application/json") => { res.writeHead(code, { "content-type": type }); res.end(body); };
  if (mode === "hang") return; // nunca responde
  if (mode === "500") return send(500, "boom");
  if (mode === "badjson") return send(200, "{esto no es json", "text/plain");
  if (mode === "html") return send(200, "<html>mantenimiento</html>", "text/html");
  if (mode === "wrongcasa") return send(200, blue(rate, { casa: "oficial" }));
  if (mode === "wrongcurrency") return send(200, blue(rate, { moneda: "EUR" }));
  if (mode === "negative") return send(200, blue(-5));
  if (mode === "string") return send(200, JSON.stringify({ moneda: "USD", casa: "blue", compra: 1480, venta: "mil quinientos", fechaActualizacion: new Date().toISOString() }));
  if (mode === "jump") return send(200, blue(rate * 3));
  if (mode === "oldpublication") return send(200, blue(rate, { fechaActualizacion: new Date(Date.now() - 6 * 24 * 3600_000).toISOString() }));
  return send(200, blue(rate));
});
await new Promise((r) => provider.listen(PROVIDER_PORT, r));

/* --------------------------------- servidor de la tienda --------------------------------- */
for (const f of [DB, DB + "-wal", DB + "-shm"]) fs.rmSync(f, { force: true });
const src = new Database(".local/data/tienda.db", { readonly: true });
await src.backup(DB);
src.close();
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
  env: { ...process.env, NEXT_DIST_DIR: DIST, DATABASE_PATH: DB, FX_PROVIDER_URL: `http://localhost:${PROVIDER_PORT}/blue`, CRON_SECRET: SECRET, BETTER_AUTH_SECRET: "prueba-" + "x".repeat(40), BETTER_AUTH_URL: BASE, MAIL_TRANSPORT: "local", FX_AUTO_REFRESH: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
const stop = () => { server.kill(); provider.close(); };
process.on("exit", stop);
for (let i = 0; i < 80; i++) {
  try { if ((await fetch(BASE + "/api/health")).ok) break; } catch { /* todavía arrancando */ }
  await new Promise((r) => setTimeout(r, 500));
  if (i === 79) { console.error("El servidor no arrancó:\n" + serverLog); process.exit(1); }
}

/* --------------------------------- utilidades --------------------------------- */
const db = () => new Database(DB, { readonly: true });
const row = () => { const d = db(); try { return d.prepare("select * from fx_settings where id = 1").get(); } finally { d.close(); } };
const pageInfo = async () => {
  const t0 = performance.now();
  const res = await fetch(BASE + PRODUCT);
  const html = await res.text();
  const ms = Math.round(performance.now() - t0);
  const m = html.match(/data-testid="precio"[^>]*>([^<]*)</);
  const usd = html.match(/data-testid="precio-usd"[^>]*>([^<]*)</);
  return { status: res.status, ms, precio: m?.[1]?.replace(/\s+/g, " ").trim() ?? null, usd: usd?.[1]?.replace(/\s+/g, " ").trim() ?? null };
};
const refresh = async () => {
  const t0 = performance.now();
  const res = await fetch(BASE + "/api/fx/refresh", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } });
  return { status: res.status, body: await res.json().catch(() => ({})), ms: Math.round(performance.now() - t0) };
};
const record = (name, esperado, obtenido, ok) => { results.push({ escenario: name, esperado, obtenido, ok }); if (!ok) failures.push(`${name}: esperado «${esperado}», obtenido «${obtenido}»`); console.log(`${ok ? "OK " : "FALLA"} ${name} → ${obtenido}`); };
const setDb = (sql, ...params) => { const d = new Database(DB); try { d.prepare(sql).run(...params); } finally { d.close(); } };
const rateOf = (r) => (r.auto_rate_10k ?? 0) / 10000;

/* --------------------------------- escenarios --------------------------------- */
try {
  const before = await pageInfo();
  record("0. base de partida: la ficha responde y muestra precio en pesos o pendiente (sin consulta previa)", "200", String(before.status), before.status === 200);

  mode = "ok"; rate = 1500;
  let r = await refresh();
  let p = await pageInfo();
  record("1. proveedor correcto (venta 1500): guarda la cotización y los pesos salen de ahí", "$ 228.000", `${p.precio} (cotización guardada ${rateOf(row())})`, r.body.ok === true && p.precio === "$ 228.000" && rateOf(row()) === 1500);

  for (const [m, label] of [["500", "2. el proveedor responde HTTP 500"], ["badjson", "3. el proveedor devuelve JSON roto"], ["html", "4. el proveedor devuelve una página HTML de mantenimiento"], ["wrongcasa", "5. el proveedor devuelve otra casa (oficial)"], ["wrongcurrency", "6. el proveedor devuelve otra moneda"], ["negative", "7. el proveedor devuelve una venta negativa"], ["string", "8. el proveedor devuelve la venta como texto"], ["jump", "9. salto sospechoso (×3 respecto de la última cotización válida)"]]) {
    mode = m;
    r = await refresh();
    p = await pageInfo();
    const f = row();
    record(label + ": se conserva la última cotización, se registra el error y la tienda sigue mostrando $ 228.000", "ok:false, 1500, error guardado, $ 228.000", `ok:${r.body.ok} · ${rateOf(f)} · error=${f.last_error ? "sí" : "no"} · ${p.precio}`, r.body.ok === false && rateOf(f) === 1500 && Boolean(f.last_error) && p.precio === "$ 228.000" && p.status === 200);
  }

  mode = "oldpublication";
  r = await refresh();
  p = await pageInfo();
  record("10. el proveedor responde pero su fecha de publicación tiene 6 días: se acepta la consulta y la cotización pasa a «sin vigencia» (pesos pendientes, USD visible)", "Precio a confirmar + USD 152,00", `${p.precio} · ${p.usd}`, p.precio === "Precio a confirmar" && /USD 152,00/.test(p.usd ?? ""));

  mode = "ok"; rate = 1600;
  r = await refresh();
  p = await pageInfo();
  record("11. el proveedor se recupera (venta 1600): vuelve a convertir, limpia el error y actualiza el precio", "$ 243.200 y sin error", `${p.precio} · error=${row().last_error ? "sí" : "no"}`, r.body.ok === true && p.precio === "$ 243.200" && !row().last_error);

  // 12. proveedor colgado: la consulta se corta a los 6 s y las páginas NO esperan
  mode = "hang";
  const pending = refresh();
  await new Promise((r2) => setTimeout(r2, 300));
  const tiempos = [];
  for (let i = 0; i < 5; i++) tiempos.push((await pageInfo()).ms);
  const hung = await pending;
  const maxMs = Math.max(...tiempos);
  record("12. el proveedor no responde: la consulta se corta a ~6 s y mientras tanto las páginas responden rápido con la cotización guardada", "consulta 5,5–8 s, páginas < 800 ms, 1600 conservada", `consulta ${hung.ms} ms (ok:${hung.body.ok}) · páginas ${tiempos.join("/")} ms · ${rateOf(row())}`, hung.body.ok === false && hung.ms >= 5500 && hung.ms < 9000 && maxMs < 800 && rateOf(row()) === 1600);

  // 13. antigüedad: entre 2 h y 24 h se usa con aviso; más de 24 h no se convierte
  mode = "ok";
  setDb("update fx_settings set auto_fetched_at = ? where id = 1", Date.now() - 5 * 3600_000);
  p = await pageInfo();
  const warn = await (await fetch(BASE + PRODUCT)).text();
  record("13. última consulta exitosa de hace 5 h: se sigue convirtiendo (con aviso de antigüedad)", "$ 243.200", `${p.precio}`, p.precio === "$ 243.200" && /más vieja de lo habitual|hace 5 h/i.test(warn));
  setDb("update fx_settings set auto_fetched_at = ? where id = 1", Date.now() - 25 * 3600_000);
  p = await pageInfo();
  record("14. última consulta exitosa de hace 25 h: NO se convierte (precio en pesos pendiente, nunca $0) y el USD se conserva", "Precio a confirmar + USD 152,00", `${p.precio} · ${p.usd}`, p.precio === "Precio a confirmar" && /USD 152,00/.test(p.usd ?? "") && p.status === 200);
  const home = await fetch(BASE + "/sellados?formato=caja");
  const homeHtml = await home.text();
  record("15. con la cotización vencida el catálogo sigue respondiendo y no muestra $0", "200 y sin «$ 0»", `${home.status} · ${/\$\s?0(?![\d.,])/.test(homeHtml) ? "aparece $0" : "sin $0"}`, home.status === 200 && !/\$\s?0(?![\d.,])/.test(homeHtml));

  r = await refresh();
  p = await pageInfo();
  record("16. al volver el proveedor la tienda recupera sus precios en pesos", "$ 243.200", String(p.precio), p.precio === "$ 243.200");

  // 17. modo manual: un proveedor que falla no lo cambia
  setDb("update fx_settings set mode = 'manual', manual_rate_10k = ?, manual_set_at = ? where id = 1", 1234 * 10000, Date.now());
  mode = "500";
  r = await refresh();
  p = await pageInfo();
  record("17. modo manual con el proveedor caído: rige el valor manual (1234) y no cambia solo", "152 × 1.234 = $ 187.600", String(p.precio), p.precio === "$ 187.600");
  setDb("update fx_settings set mode = 'auto' where id = 1");

  // 18. seguridad del endpoint de actualización
  const sin = await fetch(BASE + "/api/fx/refresh", { method: "POST" });
  const mal = await fetch(BASE + "/api/fx/refresh", { method: "POST", headers: { authorization: "Bearer otro" } });
  record("18. el endpoint de actualización exige el secreto", "401 y 401", `${sin.status} y ${mal.status}`, sin.status === 401 && mal.status === 401);
} finally {
  stop();
}
fs.writeFileSync("docs/cotizacion-fallos.json", JSON.stringify({ medidoEl: new Date().toISOString(), build: "producción (next build + next start)", base: "copia de la base local con precios USD cargados", resultados: results, fallas: failures }, null, 2));
console.log(failures.length ? `\n${failures.length} escenario(s) con falla:\n${failures.join("\n")}` : `\nLos ${results.length} escenarios se comportan como se espera.`);
process.exit(failures.length ? 1 : 0);
