// Capturas de «precios de venta + En stock». Dos servidores de desarrollo ya iniciados:
//   BASE_VACIO (catálogo real y base REAL: precios cargados, sin stock confirmado) → estado vacío honesto.
//   BASE_STOCK (misma base COPIADA a .local/data/cap-stock.db con unidades de PRUEBA cargadas solo ahí) → home y vista con productos en stock.
//   BASE_VACIO=http://localhost:3000 BASE_STOCK=http://localhost:3300 node scripts/capturas-precios-stock.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const vacio = process.env.BASE_VACIO ?? "http://localhost:3000";
const stock = process.env.BASE_STOCK ?? "http://localhost:3300";
const out = "docs/capturas/precios-stock";
fs.mkdirSync(out, { recursive: true });
const problems = [];
const browser = await chromium.launch();

async function shots(name, viewport, tag) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${tag}: consola: ${m.text()}`));
  const go = async (base, url, file, opts = {}) => {
    await page.goto(base + url, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    if (opts.selector) await page.locator(opts.selector).first().screenshot({ path: `${out}/${name}-${file}.png` });
    else await page.screenshot({ path: `${out}/${name}-${file}.png`, fullPage: opts.full ?? false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) problems.push(`${tag} ${file}: desborde horizontal`);
  };
  await go(stock, "/", "home-con-stock-seccion", { selector: "[data-testid=home-en-stock]" });
  await go(stock, "/", "home-con-stock");
  await go(vacio, "/", "home-sin-stock", {});
  await go(stock, "/sellados?disp=stock", "vista-en-stock", { full: true });
  await go(vacio, "/sellados?disp=stock", "vista-en-stock-vacia", { full: true });
  await go(stock, "/productos/abyss-eye-caja", "ficha-caja-abyss-eye");
  await go(stock, "/productos/abyss-eye-sobre", "ficha-sobre-abyss-eye");
  await go(vacio, "/productos/zh-xingcai-jingli-sobre-5", "ficha-sobre-chino");
  await ctx.close();
}
await shots("escritorio", { width: 1440, height: 900 }, "escritorio");
await shots("movil", { width: 390, height: 844 }, "movil");
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("Capturas en", out);
