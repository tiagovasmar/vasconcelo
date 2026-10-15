// Capturas de la tanda 5 (nombres en inglés, sobres de 20 cartas retirados, inicio integrado sin sección china).
//   node scripts/capturas-tanda5.mjs      (catálogo REAL en BASE, por defecto http://localhost:3000)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas/tanda5";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problemas = [];

async function pagina(ctx, url, archivo, { full = true, prep } = {}) {
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor();
  if (prep) await prep(page);
  await page.evaluate(async () => { const im = [...document.images]; im.forEach((i) => (i.loading = "eager")); await Promise.all(im.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth - innerWidth, rotas: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src) }));
  if (m.scroll > 0) problemas.push(`${archivo}: desborde horizontal ${m.scroll}px`);
  if (m.rotas.length) problemas.push(`${archivo}: imágenes rotas ${m.rotas.join(", ")}`);
  if (errores.length) problemas.push(`${archivo}: errores de consola ${errores.join(" | ")}`);
  await page.screenshot({ path: `${OUT}/${archivo}.png`, fullPage: full });
  await page.close();
}

for (const [nombre, viewport, movil] of [["escritorio", { width: 1440, height: 900 }, false], ["movil", { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", isMobile: movil, hasTouch: movil });
  await pagina(ctx, `${BASE}/`, `inicio-${nombre}`);
  await pagina(ctx, `${BASE}/sellados?idioma=zh`, `catalogo-chino-${nombre}`);
  await pagina(ctx, `${BASE}/expansiones`, `colecciones-${nombre}`);
  await pagina(ctx, `${BASE}/productos/zh-taijing-shengju-caja`, `ficha-terastal-gathering-caja-${nombre}`);
  await pagina(ctx, `${BASE}/productos/zh-cuican-guihuan-sobre-5`, `ficha-brilliant-illusions-variantes-${nombre}`);
  await pagina(ctx, `${BASE}/productos/zh-zhenshi-xuanxu-sobre-20`, `ficha-retirada-${nombre}`);
  await pagina(ctx, `${BASE}/carrito`, `carrito-antiguo-retirados-${nombre}`, {
    prep: async (page) => {
      await page.evaluate(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "zh-zhenshi-xuanxu-sobre-20", quantity: 1, priceMinor: 0, mode: "buy" }, { productId: "zh-jiajiang-huihe-sobre-20", quantity: 2, priceMinor: 0, mode: "encargo" }, { productId: "zh-taijing-shengju-sobre-10", quantity: 1, priceMinor: 0, mode: "encargo" }], delivery: { method: "retiro", locality: "", province: "", postalCode: "", pickupPoint: "haedo" }, payment: "coordinar", contactName: "", idem: null })));
      await page.reload();
      await page.locator("html[data-hydrated='true']").waitFor();
      await page.getByTestId("aviso-retirado").first().waitFor();
    },
  });
  await ctx.close();
}
await browser.close();
console.log(problemas.length ? "PROBLEMAS:\n" + problemas.join("\n") : "OK: sin desborde, sin imágenes rotas y sin errores de consola");
