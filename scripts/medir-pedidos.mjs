import fs from "node:fs";
import { chromium } from "@playwright/test";

// Solo laboratorio local autenticado y ficticio, sobre next start (build de producción).
const BASE = process.env.BASE || "http://localhost:3010";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Solo vista previa local");
const dir = ".local/preview-pedidos-continuidad";
const browser = await chromium.launch();
const measurements = [];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
try {
  for (const [profile, width, cpu, slow] of [["escritorio", 1440, 1, false], ["móvil", 390, 4, true]]) {
    const ctx = await browser.newContext({ baseURL: BASE, viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const signIn = async (email, file) => {
      await ctx.clearCookies();
      await page.goto("/cuenta/ingresar");
      await page.getByLabel("Correo electrónico").fill(email);
      await page.getByLabel("Contraseña").fill(fs.readFileSync(`${dir}/${file}`, "utf8").trim());
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await page.waitForURL((u) => !u.pathname.includes("/ingresar"));
    };
    await signIn("ana.prueba@example.com", "clientes.txt");
    await page.goto("/cuenta/consultas");
    const ref = (await page.content()).match(/TT-[A-Z0-9]{8}/)?.[0];
    if (!ref) throw new Error("Falta el pedido ficticio");
    const cases = [
      ["seguimiento cliente", `/cuenta/consultas/${ref}`, null],
      ["catálogo mayorista aprobado", "/mayoristas/catalogo", ["marta.prueba@example.com", "clientes.txt"]],
      ["pedido administrador", `/admin/pedidos/${ref}`, ["dueno.preview@example.com", "admin.txt"]],
      ["costos administrador", "/admin/costos", null],
    ];
    await page.addInitScript(() => {
      window.__pedidosMetrics = { lcp: 0, cls: 0, long: [] };
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__pedidosMetrics.lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__pedidosMetrics.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__pedidosMetrics.long.push(e.duration))).observe({ type: "longtask", buffered: true });
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (slow) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 0.75 * 1024 * 1024 / 8 });
    for (const [name, route, login] of cases) {
      if (login) await signIn(...login);
      const samples = [];
      for (let i = 0; i < 3; i++) {
        await page.goto(route, { waitUntil: "load" });
        await page.locator("html[data-hydrated=true]").waitFor();
        if (name.startsWith("catálogo")) await page.getByTestId("tabla-mayorista").waitFor();
        await page.waitForTimeout(1500);
        samples.push(await page.evaluate(() => ({ ...window.__pedidosMetrics, overflow: document.documentElement.scrollWidth - innerWidth })));
      }
      measurements.push({ profile, page: name, lcpMs: Math.round(median(samples.map((s) => s.lcp))), cls: median(samples.map((s) => s.cls)), tbtMs: Math.round(median(samples.map((s) => s.long.reduce((sum, n) => sum + Math.max(0, n - 50), 0)))), overflow: Math.max(...samples.map((s) => s.overflow)) });
    }
    await ctx.close();
  }
} finally { await browser.close(); }
const failures = measurements.filter((r) => r.overflow > 0 || r.cls >= 0.1 || r.tbtMs >= 300 || r.lcpMs >= (r.profile === "móvil" ? 4000 : 2500));
fs.writeFileSync("docs/rendimiento-pedidos.json", JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, runs: 3, description: "Laboratorio local con datos ficticios. Móvil: CPU 4x, 1.6Mb/s, latencia 150ms; no Safari/iPhone real ni Supabase/Netlify.", measurements, failures }, null, 2));
console.table(measurements);
process.exitCode = failures.length ? 1 : 0;
