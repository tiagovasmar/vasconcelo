// Medición de rendimiento de LABORATORIO (Chromium de Playwright) sobre un build de producción local y la base de desarrollo local.
//   1) npm run dev:db  (otra terminal)   2) npm run build && DB_QUERY_LOG=.local/dbq.log npx next start -p 3300   3) node scripts/medir-rendimiento.mjs
// Variables: BASE (http://localhost:3300) · ETIQUETA (antes|despues) · RUNS (5) · PERFILES (escritorio,movil) · SOLO (regex de escenarios) · DB_LOG (.local/dbq.log)
//            ADMIN_EMAIL / contraseña (.local/dev-admin.txt) para las páginas del panel.
// Qué mide: FCP, LCP, CLS, TBT (tiempo de bloqueo; NO es INP), peso transferido (total, JavaScript, imágenes), cantidad de pedidos y de consultas a la
// base por carga, y la latencia de interacciones guionadas (Event Timing: duración del evento más lento de cada gesto + tiempo hasta ver el resultado).
// Límites: son mediciones de laboratorio en esta computadora, con CPU y red emuladas. NO son datos de usuarios reales (CrUX/RUM) y no garantizan los
// mismos tiempos en Netlify. La «latencia de interacción» de un gesto guionado no equivale al INP de la página en uso real.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
const RUNS = Number(process.env.RUNS ?? 5);
const LABEL = process.env.ETIQUETA ?? "medicion";
const DB_LOG = process.env.DB_LOG ?? ".local/dbq.log";
const SOLO = process.env.SOLO ? new RegExp(process.env.SOLO, "i") : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL_PRUEBA ?? "admin-dev@example.com";
const adminPass = fs.existsSync(".local/dev-admin.txt") ? fs.readFileSync(".local/dev-admin.txt", "utf8").trim() : "";

const PERFILES = {
  escritorio: { viewport: { width: 1350, height: 940 }, isMobile: false, hasTouch: false, cpu: 1, net: null },
  // «Celular de gama baja»: CPU 6× más lenta y red ≈ Slow 4G (1,6 Mb/s bajada, 0,75 subida, 150 ms de latencia).
  movil: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 6, net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 } },
};
const CART = [
  { productId: "mega-symphonia-caja", quantity: 2, priceMinor: 0, mode: "buy" },
  { productId: "pokemon-card-151-caja", quantity: 1, priceMinor: 0, mode: "buy" },
  { productId: "glory-of-team-rocket-caja", quantity: 1, priceMinor: 0, mode: "buy" },
];
const PAGINAS = [
  ["inicio", "/"],
  ["catálogo", "/sellados"],
  ["ficha", "/productos/mega-symphonia-caja"],
  ["checkout", "/carrito", { cart: true }],
  ["admin", "/admin", { admin: true }],
  ["admin · ventas", "/admin/ventas", { admin: true, opcional: true }],
];

const median = (a) => { const s = a.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const dbCount = (t0, t1) => {
  try { return fs.readFileSync(DB_LOG, "utf8").split("\n").filter(Boolean).filter((l) => { const t = Number(l.split("\t")[0]); return t >= t0 && t <= t1; }).length; } catch { return null; }
};

const INIT = `
  window.__m = { lcp: 0, cls: 0, fcp: 0, long: [], ev: [] };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.ev.push([e.name, e.startTime, e.duration]))).observe({ type: "event", durationThreshold: 16, buffered: true }); } catch {}
`;

async function newPage(browser, prof, opts = {}) {
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  if (opts.admin) {
    const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: ADMIN_EMAIL, password: adminPass }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error(`No se pudo ingresar al panel de prueba (${r.status()}). Corré npm run dev:admin.`);
  }
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
  const stats = { total: 0, js: 0, img: 0, font: 0, reqs: 0 };
  const types = new Map();
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId);
    stats.total += e.encodedDataLength; stats.reqs++;
    if (t === "Script") stats.js += e.encodedDataLength;
    else if (t === "Image") stats.img += e.encodedDataLength;
    else if (t === "Font") stats.font += e.encodedDataLength;
  });
  await page.addInitScript(INIT);
  if (opts.cart) await page.addInitScript((c) => { try { if (!localStorage.getItem("tienda-carrito-v1")) localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: c, delivery: { method: "", locality: "", province: "", postalCode: "", pickupPoint: "" }, payment: "", contactName: "", idem: null })); } catch {} }, CART);
  return { ctx, page, cdp, stats };
}

async function medirCarga(browser, perfilNombre, prof, [nombre, ruta, opts = {}]) {
  const muestras = { fcp: [], lcp: [], cls: [], tbt: [], kb: [], jsKb: [], imgKb: [], reqs: [], db: [], ms: [] };
  let falla = "";
  for (let i = 0; i < RUNS; i++) {
    const { ctx, page, stats } = await newPage(browser, prof, opts);
    try {
      const t0 = Date.now();
      const res = await page.goto(BASE + ruta, { waitUntil: "load", timeout: 90000 });
      if (!res || res.status() >= 400) { falla = `HTTP ${res?.status()}`; await ctx.close(); break; }
      await page.locator("html[data-hydrated='true']").waitFor({ timeout: 60000 });
      await page.waitForTimeout(2500);
      const t1 = Date.now();
      const m = await page.evaluate(() => window.__m);
      muestras.fcp.push(m.fcp); muestras.lcp.push(m.lcp); muestras.cls.push(m.cls);
      muestras.tbt.push(m.long.filter(([s]) => s >= m.fcp).reduce((n, [, d]) => n + Math.max(0, d - 50), 0));
      muestras.kb.push(stats.total / 1024); muestras.jsKb.push(stats.js / 1024); muestras.imgKb.push(stats.img / 1024); muestras.reqs.push(stats.reqs);
      muestras.db.push(dbCount(t0, t1)); muestras.ms.push(t1 - t0);
    } catch (e) { falla = String(e.message).split("\n")[0]; }
    await ctx.close();
  }
  if (!muestras.lcp.length) return { tipo: "carga", perfil: perfilNombre, escenario: nombre, ruta, error: falla || "sin datos" };
  return { tipo: "carga", perfil: perfilNombre, escenario: nombre, ruta, "FCP ms": Math.round(median(muestras.fcp)), "LCP ms": Math.round(median(muestras.lcp)), CLS: Number(median(muestras.cls).toFixed(3)), "TBT ms": Math.round(median(muestras.tbt)), "KB totales": Math.round(median(muestras.kb)), "KB JS": Math.round(median(muestras.jsKb)), "KB imágenes": Math.round(median(muestras.imgKb)), pedidos: median(muestras.reqs), "consultas BD": median(muestras.db), corridas: muestras.lcp.length };
}

// Duración del evento más lento (Event Timing) que ocurrió después de `desde`.
const eventoMax = (page, desde) => page.evaluate((d) => Math.max(0, ...window.__m.ev.filter(([n, s]) => s >= d && ["click", "pointerdown", "pointerup", "mousedown", "mouseup", "keydown", "keyup"].includes(n)).map(([, , dur]) => dur)), desde);
const ahora = (page) => page.evaluate(() => performance.now());

async function esperarHidratada(page) {
  await page.locator("html[data-hydrated='true']").waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
}

async function medirInteracciones(browser, perfilNombre, prof) {
  const out = [];
  const acum = {};
  const guardar = (k, v) => { (acum[k] ??= []).push(v); };
  for (let i = 0; i < RUNS; i++) {
    // 1) Agregar desde una tarjeta del catálogo (carrito vacío): feedback = aumenta el contador del ícono.
    {
      const { ctx, page } = await newPage(browser, prof);
      await page.goto(BASE + "/sellados", { waitUntil: "load" });
      await esperarHidratada(page);
      const btn = page.getByRole("button", { name: /^Agregar .* al carrito$/ }).first();
      await btn.scrollIntoViewIfNeeded();
      const d = await ahora(page);
      const t0 = Date.now();
      await btn.click();
      await page.locator('[data-testid="cart-count"]').waitFor({ timeout: 30000 });
      guardar("agregar desde tarjeta · contador visible ms", Date.now() - t0);
      const drawer = await page.locator('[data-testid="cart-drawer"]').first().waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
      if (drawer) guardar("agregar desde tarjeta · panel lateral visible ms", Date.now() - t0);
      await page.waitForTimeout(500);
      guardar("agregar desde tarjeta · evento más lento ms", await eventoMax(page, d));
      await ctx.close();
    }
    // 2) Abrir el carrito con 3 productos. Antes: el ícono navega a /carrito. Después: abre el panel lateral.
    {
      const { ctx, page } = await newPage(browser, prof, { cart: true });
      await page.goto(BASE + "/sellados", { waitUntil: "load" });
      await esperarHidratada(page);
      const d = await ahora(page);
      const t0 = Date.now();
      await page.getByRole("link", { name: /^Carrito/ }).or(page.getByRole("button", { name: /^Carrito/ })).first().click();
      // Lo primero que aparezca: el panel lateral (después) o la página /carrito (antes).
      const drawer = page.locator('[data-testid="cart-drawer"]');
      await drawer.or(page.locator('[data-testid^="linea-"]').first()).first().waitFor({ state: "visible", timeout: 60000 });
      const esPanel = await drawer.isVisible();
      if (esPanel) {
        await page.locator('[data-testid="cart-drawer"] [data-testid^="drawer-linea-"]').first().waitFor({ timeout: 30000 });
        guardar("abrir carrito (panel lateral) · hasta ver productos ms", Date.now() - t0);
      } else {
        await page.locator('[data-testid^="linea-"]').first().waitFor({ timeout: 60000 });
        guardar("abrir carrito (página /carrito) · hasta ver productos ms", Date.now() - t0);
      }
      await page.waitForTimeout(400);
      guardar("abrir carrito · evento más lento ms", await eventoMax(page, d));
      // 3) Cambiar cantidad y quitar, dentro del panel si existe o en /carrito si no.
      const scope = esPanel ? '[data-testid="cart-drawer"] ' : "";
      const out0 = page.locator(`${scope}output[data-testid*="cantidad-"]`).first();
      const antes = (await out0.textContent())?.trim();
      const d2 = await ahora(page);
      const t2 = Date.now();
      await page.locator(`${scope}button[aria-label="Más"], ${scope}button[aria-label^="Aumentar"]`).first().click();
      await page.waitForFunction(([sel, a]) => { const e = document.querySelector(sel); return e && e.textContent.trim() !== a; }, [`${scope}output[data-testid*="cantidad-"]`, antes], { timeout: 30000 });
      guardar(`cambiar cantidad (${esPanel ? "panel" : "página"}) · cambia el número ms`, Date.now() - t2);
      await page.waitForTimeout(400);
      guardar("cambiar cantidad · evento más lento ms", await eventoMax(page, d2));
      const lineas = () => page.locator(`${scope}[data-testid^="${esPanel ? "drawer-linea-" : "linea-"}"]`).count();
      const n0 = await lineas();
      const d3 = await ahora(page);
      const t3 = Date.now();
      await page.locator(`${scope}button[aria-label^="Quitar"]`).first().click();
      await page.waitForFunction(([sel, n]) => document.querySelectorAll(sel).length < n, [`${scope}[data-testid^="${esPanel ? "drawer-linea-" : "linea-"}"]`, n0], { timeout: 30000 });
      guardar(`quitar producto (${esPanel ? "panel" : "página"}) · desaparece la línea ms`, Date.now() - t3);
      await page.waitForTimeout(400);
      guardar("quitar producto · evento más lento ms", await eventoMax(page, d3));
      await ctx.close();
    }
  }
  for (const [k, v] of Object.entries(acum)) out.push({ tipo: "interacción", perfil: perfilNombre, medida: k, "mediana ms": Math.round(median(v)), máximo: Math.round(Math.max(...v)), corridas: v.length });
  return out;
}

const browser = await chromium.launch();
const resultados = [];
try {
  for (const [pn, prof] of Object.entries(PERFILES).filter(([n]) => !process.env.PERFILES || process.env.PERFILES.split(",").includes(n))) {
    for (const pag of PAGINAS.filter(([n]) => !SOLO || SOLO.test(n))) {
      try {
        const r = await medirCarga(browser, pn, prof, pag);
        if (pag[2]?.opcional && r.error) { console.log(`(se omite ${pag[0]}: ${r.error})`); continue; }
        resultados.push(r);
        console.log(JSON.stringify(r));
      } catch (e) { console.log(`ERROR ${pn} ${pag[0]}: ${String(e.message).split("\n")[0]}`); }
    }
    if (!SOLO || SOLO.test("interacci")) {
      try {
        for (const r of await medirInteracciones(browser, pn, prof)) { resultados.push(r); console.log(JSON.stringify(r)); }
      } catch (e) { console.log(`ERROR interacciones ${pn}: ${String(e.message).split("\n")[0]}`); }
    }
  }
} finally {
  await browser.close();
}
fs.mkdirSync("docs/mediciones", { recursive: true });
const archivo = `docs/mediciones/${LABEL}.json`;
fs.writeFileSync(archivo, JSON.stringify({ etiqueta: LABEL, fecha: new Date().toISOString(), base: BASE, corridasPorMedida: RUNS, nota: "Laboratorio local (Chromium + CPU/red emuladas, build de producción, base de desarrollo). No son datos de usuarios reales ni garantizan los tiempos en Netlify. TBT no es INP.", resultados }, null, 2));
console.log(`Guardado en ${archivo}`);
