// Capturas de las tarjetas del catálogo y de las fichas (antes / después de los ajustes de tarjetas, estados de stock y fotos de cajas).
//   BASE=http://localhost:3501 PREFIJO=antes node scripts/capturas-tarjetas.mjs
// Usa un servidor propio con una COPIA de la base local (nunca la real) donde se cargaron cantidades de PRUEBA para mostrar los tres estados
// (disponible, bajo stock con umbral 3 y sin stock). Esas cantidades no existen en la base real.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3501";
const P = process.env.PREFIJO ?? "despues";
const out = "docs/capturas/tarjetas";
fs.mkdirSync(out, { recursive: true });
const problems = [];
const browser = await chromium.launch();
const pages = [
  ["cajas-japonesas", "/sellados?formato=caja&idioma=ja"],
  ["sobres", "/sellados?formato=sobre"],
  ["en-stock", "/sellados?disp=stock"],
  ["busqueda-titulos-largos", "/sellados?q=" + encodeURIComponent("Terastal")],
  ["ficha-caja-bajo-stock", "/productos/ninja-spinner-caja"],
  ["ficha-caja-disponible", "/productos/abyss-eye-caja"],
  ["ficha-caja-sin-stock", "/productos/white-flare-caja"],
  ["ficha-sobre-sin-stock", "/productos/black-bolt-sobre"],
];
for (const [name, viewport] of [["escritorio", { width: 1360, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: BASE });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  for (const [file, url] of pages) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    await page.waitForTimeout(400);
    const full = file.startsWith("ficha") ? false : true;
    await page.screenshot({ path: `${out}/${P}-${name}-${file}.png`, fullPage: full, ...(full ? { clip: undefined } : {}) });
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) problems.push(`${name} ${file}: desborde horizontal`);
  }
  await ctx.close();
}
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("Capturas en", out, "prefijo", P);
