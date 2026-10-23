// Capturas de las pantallas de recuperación (inicio, catálogo, ficha con adicionales, carrito y estados de error) en 360, 390, 430 px y escritorio.
// Contra un servidor LOCAL con base descartable y la promoción caja + sobres encendida (ver scripts/medir-resiliencia.mjs). Las fallas se simulan con page.route.
//   BASE=http://localhost:3300 node scripts/capturas-resiliencia.mjs
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3300";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) throw new Error("BASE debe ser localhost.");
const OUT = process.env.OUT ?? "docs/capturas/resiliencia";
fs.mkdirSync(OUT, { recursive: true });
const KEY = "tienda-carrito-v1";
const anchos = [["360", 360, 800], ["390", 390, 844], ["430", 430, 932], ["escritorio", 1366, 900]];
const seed = { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }, { productId: "storm-pack5", quantity: 1, priceMinor: 4200000 }], delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null };
const vis = (page, id) => page.locator(`[data-testid="${id}"]:visible`);
const browser = await chromium.launch();
const hechas = [];
const htmlCaido = process.env.BASE_CAIDO ? await fetch(process.env.BASE_CAIDO + "/sellados", { signal: AbortSignal.timeout(20000) }).then((r) => r.text()).catch(() => null) : null;
try {
  for (const [nombre, width, height] of anchos) {
    const movil = width < 768;
    const abrir = async (conCarrito = false) => {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: movil, hasTouch: movil, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.2` } });
      const page = await ctx.newPage();
      if (conCarrito) await page.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, seed]);
      return page;
    };
    const guardar = async (page, archivo, full = false) => {
      const ruta = `${OUT}/${archivo}-${nombre}.png`;
      await page.screenshot({ path: ruta, fullPage: full });
      const o = await page.evaluate(() => ({ ancho: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      hechas.push({ archivo: ruta, desborde: o.scroll - o.ancho });
      await page.context().close();
    };
    const listo = (page) => page.locator("html[data-hydrated='true']").waitFor();

    let p = await abrir();
    await p.goto(BASE + "/"); await listo(p); await p.waitForTimeout(600);
    await guardar(p, "01-inicio");

    p = await abrir();
    await p.goto(BASE + "/sellados"); await listo(p); await p.waitForTimeout(600);
    await guardar(p, "02-catalogo");

    // Ficha con adicionales: cálculo listo.
    p = await abrir();
    await p.goto(BASE + "/productos/storm-emeralda-caja"); await listo(p);
    await vis(p, "adicional-elegir-storm-sobre").click();
    await p.locator('[data-testid="adicionales-desglose"][data-estado="listo"]:visible').waitFor();
    await vis(p, "adicionales-desglose").scrollIntoViewIfNeeded();
    await guardar(p, "03-ficha-adicionales-listo");

    // Ficha: el servidor responde 500 → error con «Reintentar» y la selección intacta.
    p = await abrir();
    await p.goto(BASE + "/productos/storm-emeralda-caja"); await listo(p);
    await p.route("**/api/cart/adicionales", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "boom", message: "x" } }) }));
    await vis(p, "adicional-elegir-storm-sobre").click();
    await p.locator('[data-testid="adicionales-desglose"][data-estado="error"]:visible').waitFor();
    await vis(p, "adicionales-desglose").scrollIntoViewIfNeeded();
    await guardar(p, "04-ficha-adicionales-error");

    // Ficha: respuesta detenida → «Calculando tu selección…».
    p = await abrir();
    await p.goto(BASE + "/productos/storm-emeralda-caja"); await listo(p);
    await p.route("**/api/cart/adicionales", () => new Promise(() => {}));
    await vis(p, "adicional-elegir-storm-sobre").click();
    await p.locator('[data-testid="adicionales-desglose"][data-estado="calculando"]:visible').waitFor();
    await vis(p, "adicionales-desglose").scrollIntoViewIfNeeded();
    await guardar(p, "05-ficha-adicionales-calculando");

    // Carrito (pedido) listo.
    p = await abrir(true);
    await p.goto(BASE + "/carrito"); await listo(p);
    await p.getByTestId("resumen-productos").waitFor();
    await guardar(p, "06-carrito");

    // Carrito: la verificación falla.
    p = await abrir(true);
    await p.route("**/api/cart/validate", (r) => r.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
    await p.goto(BASE + "/carrito"); await listo(p);
    await p.getByRole("alert").filter({ hasText: "no pudimos verificar" }).waitFor();
    await guardar(p, "07-carrito-error");

    // Panel lateral: el módulo no se pudo descargar.
    p = await abrir();
    const iniciales = new Set();
    let armado = false;
    p.on("request", (rq) => { if (!armado && rq.url().includes("/_next/static/chunks/")) iniciales.add(rq.url()); });
    await p.goto(BASE + "/sellados"); await listo(p);
    armado = true;
    await p.route("**/_next/static/chunks/**", (r) => (iniciales.has(r.request().url()) ? r.continue() : r.abort("failed")));
    await p.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" }).click();
    await p.getByTestId("cart-drawer-error").waitFor();
    await guardar(p, "08-panel-lateral-error-modulo");

    // Pantalla de error de página: se usa la respuesta de un servidor SIN base de datos (BASE_CAIDO, recién iniciado: solo la primera solicitud responde rápido).
    if (htmlCaido) {
      p = await abrir();
      await p.route(process.env.BASE_CAIDO + "/sellados", (r) => r.fulfill({ status: 500, contentType: "text/html; charset=utf-8", body: htmlCaido }));
      await p.goto(process.env.BASE_CAIDO + "/sellados");
      await p.getByTestId("pantalla-error").waitFor();
      await guardar(p, "09-pantalla-error");
    }
  }
} finally {
  await browser.close();
}
console.table(hechas);
fs.writeFileSync(`${OUT}/desborde.json`, JSON.stringify(hechas, null, 2));
