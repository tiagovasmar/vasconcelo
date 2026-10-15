// Capturas del inicio (escritorio y móvil) contra un servidor ya iniciado: BASE=http://localhost:3000 node scripts/capturas-inicio.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const out = "docs/capturas";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const [name, viewport, extra] of [["escritorio", { width: 1440, height: 900 }, {}], ["movil", { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", ...extra });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) problems.push(`${name}: desborde horizontal de ${over}px`);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  if (broken.length) problems.push(`${name}: imágenes rotas ${broken.join(", ")}`);
  await page.screenshot({ path: `${out}/inicio-${name}-arriba.png` });
  await page.screenshot({ path: `${out}/inicio-${name}-completo.png`, fullPage: true });
  // un banner por colección: se recorre el carrusel con el botón «siguiente»
  const ids = await page.locator("[data-testid^=diapositiva-]").evaluateAll((l) => l.map((x) => x.getAttribute("data-testid").replace("diapositiva-", "")));
  const car = page.getByTestId("carrusel");
  await car.scrollIntoViewIfNeeded();
  for (let i = 0; i < ids.length; i++) {
    await page.locator(`[data-testid=diapositiva-${ids[i]}][data-active=true]`).waitFor();
    await page.waitForTimeout(500);
    await car.screenshot({ path: `${out}/banner-${name}-${String(i + 1).padStart(2, "0")}-${ids[i]}.png` });
    if (i < ids.length - 1) await page.getByTestId("carrusel-siguiente").click();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  if (name === "escritorio") {
    // cartas destacadas con zoom (mouse sobre la carta del medio)
    const lista = page.getByTestId("cartas-destacadas");
    await lista.scrollIntoViewIfNeeded();
    await lista.getByRole("link").nth(1).hover();
    await page.waitForTimeout(600);
    await page.locator("section[aria-labelledby=cards-title]").screenshot({ path: `${out}/inicio-escritorio-cartas-zoom.png` });
  }
  // detalle de expansión con su banner
  await page.goto(BASE + "/expansiones/heat-wave-arena", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/expansion-${name}-heat-wave-arena.png` });
  const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over2 > 0) problems.push(`${name}: detalle de expansión con desborde de ${over2}px`);
  // etiquetas de colección e idioma: tarjetas y ficha
  await page.goto(BASE + "/expansiones/storm-emeralda#exp-prods", { waitUntil: "networkidle" });
  await page.locator("#exp-prods").locator("xpath=..").screenshot({ path: `${out}/etiquetas-${name}-tarjetas.png` });
  await page.goto(BASE + "/productos/storm-emeralda-caja", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${out}/etiquetas-${name}-ficha.png` });
  // galería de la ficha: foto del fabricante y caja abierta de exhibición, con la sección de cartas ilustrativas
  await page.goto(BASE + "/productos/inferno-x-caja", { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated=true]").waitFor();
  await page.getByTestId("galeria-etiqueta").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/galeria-${name}-fabricante.png` });
  await page.getByRole("list", { name: "Miniaturas" }).getByRole("button").nth(1).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/galeria-${name}-exhibicion-abierta.png` });
  await page.locator("#cartas").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/galeria-${name}-cartas-ilustrativas.png` });
  await ctx.close();
}
await browser.close();
console.log(problems.length ? problems.join("\n") : "Capturas OK: sin desborde, sin imágenes rotas, sin errores de consola.");
process.exit(problems.length ? 1 : 0);
