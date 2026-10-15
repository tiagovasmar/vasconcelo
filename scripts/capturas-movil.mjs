// Capturas móviles antes/después de la optimización de presentación móvil (360, 390 y 430 px) y mediciones de geometría.
//   BASE=http://localhost:3501 PREFIJO=antes node scripts/capturas-movil.mjs
// Usa un servidor propio con una COPIA de la base (nunca la real). No envía mensajes: no se pulsa «Abrir WhatsApp».
// Escribe docs/capturas/movil/<PREFIJO>-<ancho>-<pagina>.png y docs/capturas/movil/medidas-<PREFIJO>.json
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3501";
const P = process.env.PREFIJO ?? "despues";
const out = "docs/capturas/movil";
fs.mkdirSync(out, { recursive: true });
const pages = [
  ["inicio", "/", { full: false }],
  ["catalogo", "/sellados", { full: false }],
  ["catalogo-completo", "/sellados?formato=caja&idioma=ja", { full: true }],
  ["ficha-bajo-stock", "/productos/storm-emeralda-caja", { full: false }],
  ["ficha-disponible", "/productos/abyss-eye-sobre", { full: false }],
  ["ficha-sin-stock", "/productos/ninja-spinner-caja", { full: false }],
  ["ficha-titulo-largo", "/productos/zh-taijing-shengju-caja", { full: false }],
  ["carrito-vacio", "/carrito", { full: false }],
];
const problems = [];
const medidas = {};
const browser = await chromium.launch();
for (const width of [360, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", baseURL: BASE });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${width}: consola: ${m.text()}`));
  for (const [file, url, { full }] of pages) {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${P}-${width}-${file}.png`, fullPage: full });
    const m = await page.evaluate(() => {
      const r = (el) => (el ? Math.round(el.getBoundingClientRect().top + scrollY) : null);
      const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : null);
      const first = document.querySelector("[data-testid=tarjeta]");
      const small = [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea")].filter((e) => e.offsetParent).map((e) => parseFloat(getComputedStyle(e).fontSize)).filter((s) => s < 16).length;
      return {
        desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        alturaCarrusel: h(document.querySelector("[data-testid=carrusel]")),
        primeraTarjetaTop: r(first), primeraTarjetaAlto: h(first),
        alturaDocumento: document.documentElement.scrollHeight,
        camposMenosDe16px: small,
      };
    });
    medidas[`${width}/${file}`] = m;
    if (m.desborde) problems.push(`${width} ${file}: desborde horizontal`);
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/medidas-${P}.json`, JSON.stringify(medidas, null, 2));
console.log(JSON.stringify(medidas, null, 1));
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
