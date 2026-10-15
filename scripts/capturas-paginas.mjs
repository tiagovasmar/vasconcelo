// Capturas de página completa de las rutas del catálogo (escritorio y móvil) y comprobación de desborde/errores.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas";
const routes = [
  ["catalogo", "/sellados"],
  ["catalogo-filtrado", "/sellados?formato=caja&disp=stock&orden=precio-desc"],
  ["catalogo-vacio", "/sellados?q=no-existe-xyz"],
  ["expansiones", "/expansiones"],
  ["expansion-storm", "/expansiones/storm-emeralda"],
  ["expansion-completa", "/expansiones/set-de-ejemplo"],
  ["producto-caja", "/productos/storm-emeralda-caja"],
  ["producto-sobre-parcial", "/productos/set-parcial-de-ejemplo-sobre"],
  ["producto-pack-mixto", "/productos/pack-mixto-de-ejemplo"],
  ["producto-caja-ejemplo", "/productos/set-de-ejemplo-caja"],
  ["como-comprar", "/como-comprar"],
  ["privacidad", "/privacidad"],
  ["condiciones", "/condiciones"],
  ["producto-inexistente", "/productos/no-existe"],
];
const sizes = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "movil", width: 390, height: 844 },
  { name: "movil-320", width: 320, height: 700 },
];
const only = process.argv[2];
const browser = await chromium.launch();
const problems = [];
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const [name, route] of routes) {
    if (only && !name.includes(only)) continue;
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) problems.push(`${name} ${s.name}: desborde horizontal ${over}px`);
    if (name !== "producto-inexistente" && errors.length) problems.push(`${name} ${s.name}: ${errors.join(" | ").slice(0, 200)}`);
  }
  if (s.width < 1024) {
    await page.goto(BASE + "/sellados", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Filtros y orden/ }).click();
    await page.screenshot({ path: `${OUT}/filtros-hoja-${s.name}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMAS:\n" + problems.join("\n") : "OK: sin desbordes ni errores de consola");
process.exit(problems.length ? 1 : 0);
