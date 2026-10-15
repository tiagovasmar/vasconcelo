// Capturas de las seis cajas japonesas agregadas el 14/10/2026 (servidor ya iniciado con el catálogo real).
//   BASE=http://localhost:3000 node scripts/capturas-seis-cajas.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.env.BASE ?? "http://localhost:3000";
const out = "docs/capturas/seis-cajas";
fs.mkdirSync(out, { recursive: true });
const problems = [];
const browser = await chromium.launch();
const slugs = ["terastal-festival-ex-caja", "ninja-spinner-caja", "nihil-zero-caja", "glory-of-team-rocket-caja", "mega-symphonia-caja", "pokemon-card-151-caja"];
for (const [name, viewport] of [["escritorio", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  const go = async (url, file, full = false) => {
    await page.goto(base + url, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    await page.screenshot({ path: `${out}/${name}-${file}.png`, fullPage: full });
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) problems.push(`${name} ${file}: desborde horizontal`);
  };
  for (const s of slugs) await go(`/productos/${s}`, `ficha-${s}`);
  await go("/sellados?formato=caja&idioma=ja", "catalogo-cajas-japonesas", true);
  await go("/sellados?q=151", "busqueda-151", true);
  await go("/expansiones/ninja-spinner", "coleccion-ninja-spinner", true);
  await go("/sellados?disp=stock", "en-stock-vacio", true);
  await go("/", "inicio-sin-cambios");
  await ctx.close();
}
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("Capturas en", out);
