// Mide carga e interactividad en el BUILD DE PRODUCCIÓN local, con CPU y red limitadas por el protocolo de Chrome (CDP), en una base descartable:
//   LCP, CLS, TBT aproximado (tareas largas), peso transferido y, en la ficha, la latencia de las interacciones (Event Timing: lo que mide INP).
//   Prerrequisito: un servidor `next start` sobre una base de PRUEBA con el catálogo demo y la promoción caja + sobres encendida
//   (.local/resil/arrancar.cjs la levanta; node scripts/medir-resiliencia.mjs la enciende si falta). Nunca apunta a producción: BASE debe ser localhost.
//   BASE=http://localhost:3300 RUNS=5 node scripts/medir-resiliencia.mjs
// Son mediciones LOCALES (laboratorio): no equivalen a usuarios reales, a un teléfono físico ni al hosting. INP de laboratorio = la interacción más lenta de un
// recorrido corto y guionado, no el percentil 98 de una sesión real.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("BASE debe ser localhost: este script no se usa contra producción.");
const RUNS = Number(process.env.RUNS ?? 5);
const OUT = process.env.OUT;
const MAIL_DIR = process.env.MAIL_DIR ?? ".local/data/resil-mail";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";

const perfiles = {
  "móvil (CPU 4×, 1,6 Mb/s, 150 ms)": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 } },
  "móvil lento (CPU 4×, 400 kb/s, 400 ms)": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 400, downloadThroughput: (0.4 * 1024 * 1024) / 8, uploadThroughput: (0.2 * 1024 * 1024) / 8 } },
  "escritorio (sin límites)": { viewport: { width: 1350, height: 940 }, isMobile: false, hasTouch: false, cpu: 1, net: null },
};
const anchos = process.env.ANCHOS ? process.env.ANCHOS.split(",").map(Number) : [];
const paginas = [["inicio", "/"], ["catálogo", "/sellados"], ["ficha caja con adicionales", "/productos/storm-emeralda-caja"], ["carrito (2 sobres)", "/carrito"]];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const KEY = "tienda-carrito-v1";

async function prepararPromocion() {
  const ctx = await (await chromium.launch()).newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": "10.9.9.9" } });
  const p = await ctx.newPage();
  const sign = () => p.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: OWNER, password: PASSWORD }, headers: { Origin: BASE } });
  if (!(await sign()).ok()) {
    await p.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de la Tienda", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
    for (let i = 0; i < 30; i++) {
      const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).sort() : [];
      const m = files.map((f) => JSON.parse(fs.readFileSync(`${MAIL_DIR}/${f}`, "utf8"))).filter((x) => x.to === OWNER && x.kind === "verificacion").pop();
      if (m) { await p.goto(m.link); break; }
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  await p.request.patch(`${BASE}/api/admin/promociones`, { data: { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "parcial-sobre"], expectedVersion: 0 }, headers: { Origin: BASE } });
  await ctx.browser().close();
}

const initScript = () => {
  window.__m = { lcp: 0, cls: 0, fcp: 0, long: [], ev: new Map() };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  // Interacciones (clic/toque/teclado): la duración de cada una hasta el siguiente cuadro pintado. INP = la peor (o casi) de las interacciones de la sesión.
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.interactionId > 0) window.__m.ev.set(e.interactionId, Math.max(window.__m.ev.get(e.interactionId) ?? 0, e.duration)); })).observe({ type: "event", durationThreshold: 16, buffered: true });
};

async function medirPagina(browser, prof, ruta, { seed, interactuar }) {
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, reducedMotion: "no-preference", extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1` } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
  await page.addInitScript(initScript);
  if (seed) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [KEY, seed]);
  if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
  await page.goto(BASE + ruta, { waitUntil: "load" });
  await page.locator("html[data-hydrated='true']").waitFor({ timeout: 90000 });
  // Con páginas que se envían por partes (loading.tsx) la hidratación del diseño puede ocurrir antes de que llegue el contenido: se espera a que la red se aquiete.
  await page.waitForLoadState("networkidle", { timeout: 90000 });
  await page.waitForTimeout(1500);
  const carga = await page.evaluate(() => ({ lcp: window.__m.lcp, cls: window.__m.cls, fcp: window.__m.fcp, long: window.__m.long }));
  let inp = null;
  if (interactuar) {
    await interactuar(page);
    await page.waitForTimeout(600);
    inp = await page.evaluate(() => Math.max(0, ...window.__m.ev.values()));
  }
  const cls = await page.evaluate(() => window.__m.cls); // incluye lo que se movió durante las interacciones
  await ctx.close();
  return { lcp: carga.lcp, cls, fcp: carga.fcp, tbt: carga.long.filter(([s]) => s >= carga.fcp).reduce((n, [, d]) => n + Math.max(0, d - 50), 0), kb: bytes / 1024, inp };
}

const visible = (page, id) => page.locator(`[data-testid="${id}"]:visible`);
async function recorridoFicha(page) {
  await visible(page, "adicional-elegir-storm-sobre").click();
  await visible(page, "desglose-total").waitFor({ timeout: 60000 }); // el total del servidor (existe antes y después de esta tanda)
  await visible(page, "adicional-mas-storm-sobre").click();
  await page.waitForTimeout(900);
  await visible(page, "agregar").click(); // valida en el servidor y abre el panel lateral
  await page.getByTestId("cart-drawer").waitFor({ timeout: 60000 });
  await page.keyboard.press("Escape");
}

if (process.env.PREPARAR !== "0" && !process.env.SIN_INTERACCION) await prepararPromocion();
const browser = await chromium.launch();
const filas = [];
try {
  for (const [pn, prof0] of Object.entries(perfiles).filter(([n]) => !process.env.PERFIL || new RegExp(process.env.PERFIL, "i").test(n))) {
    const prof = prof0;
    for (const [nombre, ruta] of paginas.filter(([n]) => !process.env.PAGINA || new RegExp(process.env.PAGINA, "i").test(n))) {
      const seed = ruta === "/carrito" ? { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: {}, payment: "efectivo", contactName: "Ana", idem: null } : null;
      const interactuar = ruta.startsWith("/productos/") && !process.env.SIN_INTERACCION ? recorridoFicha : null; // con el catálogo real no hay adicionales (precios por confirmar)
      const m = { lcp: [], cls: [], tbt: [], kb: [], fcp: [], inp: [] };
      for (let i = 0; i < RUNS; i++) {
        const r = await medirPagina(browser, prof, ruta, { seed, interactuar });
        for (const k of Object.keys(m)) if (r[k] !== null) m[k].push(r[k]);
      }
      const fila = { perfil: pn, página: nombre, "FCP ms": Math.round(median(m.fcp)), "LCP ms": Math.round(median(m.lcp)), CLS: Number(median(m.cls).toFixed(3)), "TBT ms": Math.round(median(m.tbt)), "KB transferidos": Math.round(median(m.kb)), "INP lab ms": m.inp.length ? Math.round(median(m.inp)) : "—", corridas: RUNS };
      filas.push(fila);
      console.log(JSON.stringify(fila));
    }
  }
  // Barrido de anchos (solo diseño: desborde horizontal) en las cuatro páginas, sin limitación de red.
  for (const w of anchos) {
    for (const [nombre, ruta] of paginas) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: w < 768, hasTouch: w < 768 });
      const page = await ctx.newPage();
      await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: {}, payment: "efectivo", contactName: "Ana", idem: null }]);
      await page.goto(BASE + ruta);
      await page.locator("html[data-hydrated='true']").waitFor();
      const o = await page.evaluate(() => ({ ancho: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      console.log(JSON.stringify({ ancho: w, página: nombre, desborde: o.scroll - o.ancho }));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ fecha: new Date().toISOString(), base: BASE, corridas: RUNS, filas }, null, 2));
