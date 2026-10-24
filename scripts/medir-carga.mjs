// Mide la carga de páginas separando respuesta del servidor, descarga, pintado e interactividad, sobre un `next start` LOCAL con base descartable.
//   BASE=http://localhost:3300 RUNS=7 OUT=docs/mediciones/x.json node scripts/medir-carga.mjs
// Variables: PERFIL=regex (móvil|lento|escritorio), PAGINA=regex, RUNS, OUT, ETIQUETA, CATALOGO (solo informativo).
// Por corrida y página: TTFB (responseStart), fin de respuesta, DOMContentLoaded, load, FCP, LCP (tiempo + elemento), CLS, TBT, «hidratada» (cuando la página
// ya responde: html[data-hydrated]), bytes transferidos por tipo (documento, JS, CSS, imágenes, fuentes, otros) y cantidad de solicitudes.
// Se informa la MEDIANA y el rango (mín–máx). Es laboratorio local (Chromium con CPU/red limitadas por CDP): no son datos de usuarios reales ni del hosting.
// Nunca apunta a producción: BASE debe ser localhost.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("BASE debe ser localhost: este script no se usa contra producción.");
const RUNS = Number(process.env.RUNS ?? 7);
const KEY = "tienda-carrito-v1";
const perfiles = {
  "móvil": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 } },
  "móvil lento": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 400, downloadThroughput: (0.4 * 1024 * 1024) / 8, uploadThroughput: (0.2 * 1024 * 1024) / 8 } },
  "escritorio": { viewport: { width: 1350, height: 940 }, isMobile: false, hasTouch: false, cpu: 1, net: null },
};
const carrito = { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: {}, payment: "efectivo", contactName: "Ana", idem: null };
const paginas = [["inicio", "/"], ["catálogo", "/sellados"], ["ficha Storm Emeralda", "/productos/storm-emeralda-caja"], ["carrito", "/carrito", carrito]];
const sorted = (a) => [...a].sort((x, y) => x - y);
const med = (a) => sorted(a)[Math.floor(a.length / 2)];
const rango = (a) => `${Math.round(Math.min(...a))}–${Math.round(Math.max(...a))}`;

const initScript = () => {
  window.__m = { lcp: 0, lcpEl: "", lcpUrl: "", cls: 0, fcp: 0, long: [], hyd: 0 };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__m.lcp = e.startTime; window.__m.lcpEl = e.element ? e.element.tagName : "?"; window.__m.lcpUrl = (e.url || "").replace(/^.*\/_next\/image\?url=/, "").slice(0, 70); })).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  const iv = setInterval(() => { if (document.documentElement.dataset.hydrated === "true") { window.__m.hyd = performance.now(); clearInterval(iv); } }, 20);
};

async function una(browser, prof, ruta, seed) {
  const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, reducedMotion: "no-preference", extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7` } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { type: e.type, url: e.request.url, kb: 0 }));
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) r.kb = e.encodedDataLength / 1024; });
  await page.addInitScript(initScript);
  if (seed) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); }, [KEY, seed]);
  if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
  if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
  await page.goto(BASE + ruta, { waitUntil: "load" });
  await page.locator("html[data-hydrated='true']").waitFor({ timeout: 90000 });
  await page.waitForLoadState("networkidle", { timeout: 90000 });
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return { ...window.__m, ttfb: n.responseStart, respEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  const por = { doc: 0, js: 0, css: 0, img: 0, font: 0, otros: 0 };
  let n = 0;
  for (const r of reqs.values()) {
    if (!r.kb) continue;
    n++;
    const k = r.type === "Document" ? "doc" : r.type === "Script" ? "js" : r.type === "Stylesheet" ? "css" : r.type === "Image" ? "img" : r.type === "Font" ? "font" : "otros";
    por[k] += r.kb;
  }
  await ctx.close();
  return { ttfb: d.ttfb, respEnd: d.respEnd, dcl: d.dcl, load: d.load, fcp: d.fcp, lcp: d.lcp, lcpEl: d.lcpEl, lcpUrl: d.lcpUrl, cls: d.cls, hyd: d.hyd, tbt: d.long.filter(([s]) => s >= d.fcp).reduce((a, [, x]) => a + Math.max(0, x - 50), 0), ...por, total: Object.values(por).reduce((a, b) => a + b, 0), n };
}

const browser = await chromium.launch();
const filas = [];
try {
  for (const [pn, prof] of Object.entries(perfiles).filter(([x]) => !process.env.PERFIL || new RegExp(process.env.PERFIL, "i").test(x))) {
    for (const [nombre, ruta, seed] of paginas.filter(([x]) => !process.env.PAGINA || new RegExp(process.env.PAGINA, "i").test(x))) {
      const rs = [];
      for (let i = 0; i < RUNS; i++) rs.push(await una(browser, prof, ruta, seed));
      const c = (k) => rs.map((r) => r[k]);
      const els = {};
      for (const r of rs) els[`${r.lcpEl}${r.lcpUrl ? " " + r.lcpUrl.slice(-34) : ""}`] = (els[`${r.lcpEl}${r.lcpUrl ? " " + r.lcpUrl.slice(-34) : ""}`] ?? 0) + 1;
      const fila = { perfil: pn, pagina: nombre, corridas: RUNS };
      for (const k of ["ttfb", "respEnd", "dcl", "load", "fcp", "lcp", "hyd", "tbt", "cls", "doc", "js", "css", "img", "font", "otros", "total", "n"]) { fila[k] = k === "cls" ? Number(med(c(k)).toFixed(3)) : Math.round(med(c(k))); fila[`${k}_r`] = k === "cls" ? `${Math.min(...c(k)).toFixed(3)}–${Math.max(...c(k)).toFixed(3)}` : rango(c(k)); }
      fila.lcpElemento = els;
      filas.push(fila);
      console.log(`${pn.padEnd(12)} ${nombre.padEnd(22)} TTFB ${fila.ttfb} | resp ${fila.respEnd} | FCP ${fila.fcp} | LCP ${fila.lcp} (${fila.lcp_r}) ${JSON.stringify(els)} | hidratada ${fila.hyd} | TBT ${fila.tbt} | CLS ${fila.cls} | KB ${fila.total} (js ${fila.js} css ${fila.css} img ${fila.img} font ${fila.font}) n=${fila.n}`);
    }
  }
} finally {
  await browser.close();
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ fecha: new Date().toISOString(), base: BASE, etiqueta: process.env.ETIQUETA ?? "", corridas: RUNS, filas }, null, 2));
