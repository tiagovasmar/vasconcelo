// CLS de la página del pedido (/carrito) con distintos carritos guardados, mediana de varias corridas, con las mismas condiciones para cualquier servidor.
//   BASE=http://localhost:3200 RUNS=7 node scripts/medir-cls-pedido.mjs        (build de producción local + base de desarrollo con precios de prueba)
// Escenarios: (A) carrito guardado por esta versión (con título e imagen); (B) carrito viejo, sin título, con precios vigentes;
// (C) carrito viejo cuyos precios cambiaron (el aviso «Cambió el precio» aparece al validar: es contenido real que hay que confirmar).
// Son mediciones de laboratorio (CPU y red emuladas); no son datos de usuarios reales.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3200";
const RUNS = Number(process.env.RUNS ?? 7);
const ETIQUETA = process.env.ETIQUETA ?? "cls-pedido";
const A = [{ productId: "mega-symphonia-caja", quantity: 2, priceMinor: 16900000, mode: "buy", title: "Mega Symphonia · Caja de 30 sobres", imageSrc: "/images/products/mega-symphonia/caja-referencia-2-closed-v2.webp" }, { productId: "pokemon-card-151-caja", quantity: 1, priceMinor: 41210000, mode: "buy", title: "Pokémon Card 151 · Caja" }];
const B = A.map(({ title, imageSrc, ...r }) => { void title; void imageSrc; return r; });
const C = B.map((r) => ({ ...r, priceMinor: 1000000 }));
const escenarios = { "A · carrito de esta versión (con título)": A, "B · carrito viejo, precios vigentes": B, "C · carrito viejo con precios cambiados": C };
const perfiles = { movil: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 6 }, escritorio: { viewport: { width: 1350, height: 940 }, cpu: 1 } };
const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await chromium.launch();
const out = [];
for (const [pn, p] of Object.entries(perfiles)) {
  for (const [en, items] of Object.entries(escenarios)) {
    const vals = [];
    for (let i = 0; i < RUNS; i++) {
      const ctx = await browser.newContext({ viewport: p.viewport, isMobile: p.isMobile, hasTouch: p.hasTouch, extraHTTPHeaders: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: 90000 });
      if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
      await page.addInitScript((it) => {
        localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: it, delivery: {}, payment: "", contactName: "", idem: null }));
        window.__cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: "layout-shift", buffered: true });
      }, items);
      await page.goto(BASE + "/carrito", { waitUntil: "load" });
      await page.waitForTimeout(3500);
      vals.push(await page.evaluate(() => window.__cls));
      await ctx.close();
    }
    const r = { perfil: pn, escenario: en, "CLS mediana": Number(mediana(vals).toFixed(3)), min: Number(Math.min(...vals).toFixed(3)), max: Number(Math.max(...vals).toFixed(3)), corridas: RUNS };
    out.push(r);
    console.log(JSON.stringify(r));
  }
}
await browser.close();
fs.mkdirSync("docs/mediciones", { recursive: true });
fs.writeFileSync(`docs/mediciones/${ETIQUETA}.json`, JSON.stringify({ etiqueta: ETIQUETA, fecha: new Date().toISOString(), base: BASE, nota: "Laboratorio local; no son datos de usuarios reales.", resultados: out }, null, 2));
