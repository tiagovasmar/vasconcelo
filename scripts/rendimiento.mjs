// Mide rendimiento real en el navegador (Chromium de Playwright) sobre el BUILD DE PRODUCCIÓN local:
// FCP, LCP, CLS, TBT aproximado y peso transferido, con la mediana de varias corridas.
//   npm run build && BETTER_AUTH_SECRET=<cualquier-valor-largo> npx next start -p 3300 &  →  node scripts/rendimiento.mjs
// Perfiles: «móvil» (390×844, CPU 4× más lenta, red ~1,6 Mb/s con 150 ms de latencia, parecido al perfil móvil de Lighthouse)
// y «escritorio» (sin límites). Son mediciones LOCALES: no equivalen a usuarios reales ni a un hosting concreto.
// Presupuestos (el script falla si se superan): CLS < 0,1 · TBT < 300 ms · LCP < 2,5 s en escritorio y < 4 s en móvil.
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
const RUNS = Number(process.env.RUNS ?? 5);
// CATALOG=real mide el catálogo REAL (fotos de producto y listas de cartas de verdad); sin esa variable, el catálogo de prueba.
const real = process.env.CATALOG === "real";
const routesReal = [["inicio", "/"], ["catálogo (cajas japonesas)", "/sellados?formato=caja&idioma=ja"], ["En stock (2 productos)", "/sellados?disp=stock"], ["ficha caja (fotos oficiales)", "/productos/ninja-spinner-caja"], ["ficha caja (foto de proveedor)", "/productos/pokemon-card-151-caja"], ["ficha caja china (fotos de proveedor)", "/productos/zh-taijing-shengju-caja"], ["colección con 120 cartas", "/expansiones/ninja-spinner"], ["colección con 237 cartas", "/expansiones/terastal-festival-ex"], ["carrito", "/carrito"]];
const routesDemo = [["inicio", "/"], ["catálogo", "/sellados"], ["ficha (lista no disponible)", "/productos/storm-emeralda-caja"], ["ficha (lista completa)", "/productos/set-de-ejemplo-sobre"], ["expansión", "/expansiones/set-de-ejemplo"], ["carrito", "/carrito"], ["cómo comprar", "/como-comprar"], ["ingresar", "/cuenta/ingresar"]];
// ONLY=regex limita las páginas y PERFILES=a,b los perfiles (para repetir una medición puntual).
const routes = (real ? routesReal : routesDemo).filter(([n]) => !process.env.ONLY || new RegExp(process.env.ONLY, "i").test(n));
const profiles = {
  móvil: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8 }, lcp: 4000 },
  // Red lenta (≈ 3G): 400 kb/s y 400 ms de latencia, CPU 4× más lenta. Presupuesto de LCP más holgado: es un peor caso, no el uso normal.
  "móvil lento": { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, cpu: 4, net: { latency: 400, downloadThroughput: (0.4 * 1024 * 1024) / 8, uploadThroughput: (0.2 * 1024 * 1024) / 8 }, lcp: 8000 },
  escritorio: { viewport: { width: 1350, height: 940 }, isMobile: false, hasTouch: false, cpu: 1, net: null, lcp: 2500 },
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const browser = await chromium.launch();
const rows = [];
const failures = [];
try {
  for (const [pname, prof] of Object.entries(profiles).filter(([n]) => !process.env.PERFILES || process.env.PERFILES.split(",").includes(n))) {
    for (const [rname, route] of routes) {
      const samples = { fcp: [], lcp: [], cls: [], tbt: [], kb: [] };
      for (let i = 0; i < RUNS; i++) {
        const ctx = await browser.newContext({ viewport: prof.viewport, isMobile: prof.isMobile, hasTouch: prof.hasTouch, reducedMotion: "no-preference" });
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Network.enable");
        if (prof.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...prof.net });
        if (prof.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: prof.cpu });
        let bytes = 0;
        cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
        await page.addInitScript(() => {
          window.__m = { lcp: 0, cls: 0, fcp: 0, long: [] };
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__m.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__m.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name === "first-contentful-paint") window.__m.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__m.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
        });
        await page.goto(BASE + route, { waitUntil: "load" });
        await page.locator("html[data-hydrated='true']").waitFor({ timeout: 60000 });
        await page.waitForTimeout(1500); // deja asentar LCP y cambios de diseño tardíos
        const m = await page.evaluate(() => window.__m);
        samples.fcp.push(m.fcp);
        samples.lcp.push(m.lcp);
        samples.cls.push(m.cls);
        samples.tbt.push(m.long.filter(([s]) => s >= m.fcp).reduce((n, [, d]) => n + Math.max(0, d - 50), 0));
        samples.kb.push(bytes / 1024);
        await ctx.close();
      }
      const row = { perfil: pname, página: rname, "FCP ms": Math.round(median(samples.fcp)), "LCP ms": Math.round(median(samples.lcp)), CLS: Number(median(samples.cls).toFixed(3)), "TBT ms": Math.round(median(samples.tbt)), "KB transferidos": Math.round(median(samples.kb)) };
      rows.push(row);
      if (row.CLS >= 0.1) failures.push(`${pname}/${rname}: CLS ${row.CLS} ≥ 0,1`);
      if (row["TBT ms"] >= 300) failures.push(`${pname}/${rname}: TBT ${row["TBT ms"]} ms ≥ 300`);
      if (row["LCP ms"] >= prof.lcp) failures.push(`${pname}/${rname}: LCP ${row["LCP ms"]} ms ≥ ${prof.lcp}`);
    }
  }
} finally {
  await browser.close();
}
console.table(rows);
fs.mkdirSync("docs", { recursive: true });
if (!process.env.ONLY && !process.env.PERFILES) fs.writeFileSync(real ? "docs/rendimiento-real.json" : "docs/rendimiento.json", JSON.stringify({ medidoEl: new Date().toISOString(), catalogo: real ? "real" : "prueba", base: BASE, corridas: RUNS, filas: rows, incumplimientos: failures }, null, 2));
console.log(failures.length ? "SUPERA PRESUPUESTOS:\n" + failures.join("\n") : "Dentro de los presupuestos.");
process.exit(failures.length ? 1 : 0);
