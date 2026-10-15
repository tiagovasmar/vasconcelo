// Capturas del lote de colecciones (catálogo real) en escritorio y móvil, con comprobación de desborde y de imágenes rotas.
// Requiere el servidor con el catálogo real en BASE (por defecto http://localhost:3000, `npm run dev`).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas";
const KEY = "tienda-carrito-v1";
const rutas = [
  ["col-inicio", "/"],
  ["col-catalogo", "/sellados"],
  ["col-catalogo-p2", "/sellados?pagina=2"],
  ["col-expansiones", "/expansiones"],
  ["col-caja-storm", "/productos/storm-emeralda-caja"],
  ["col-sobre-blackbolt", "/productos/black-bolt-sobre"],
  ["col-sobre-mega-dream", "/productos/mega-dream-ex-sobre"],
  ["col-caja-30th", "/productos/30th-celebration-caja"],
  ["col-expansion-heatwave", "/expansiones/heat-wave-arena"],
];
const sizes = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "movil", width: 390, height: 844 },
  { name: "movil-320", width: 320, height: 700 },
];
const browser = await chromium.launch();
const problemas = [];
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errores = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  for (const [name, ruta] of rutas) {
    errores.length = 0;
    await page.goto(BASE + ruta);
    await page.locator("html[data-hydrated='true']").waitFor();
    // las imágenes del primer recorrido de la página deben cargar de verdad
    await page.evaluate(async () => {
      const imgs = [...document.images];
      imgs.forEach((i) => (i.loading = "eager"));
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    await page.waitForTimeout(400);
    const rotas = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    if (rotas.length) problemas.push(`${name} ${s.name}: imágenes rotas ${rotas.slice(0, 2).join(", ")}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) problemas.push(`${name} ${s.name}: desborde horizontal ${over}px`);
    if (errores.length) problemas.push(`${name} ${s.name}: errores de consola ${errores.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: true });
  }
  // carrito con un producto pendiente guardado
  await page.goto(BASE);
  await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, { items: [{ productId: "abyss-eye-caja", quantity: 1, priceMinor: 1 }], delivery: {}, payment: "coordinar", contactName: "", idem: null }]);
  await page.goto(BASE + "/carrito");
  await page.getByTestId("aviso-pendiente").waitFor();
  await page.screenshot({ path: `${OUT}/col-carrito-pendiente-${s.name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(problemas.length ? "PROBLEMAS:\n" + problemas.join("\n") : "OK: capturas del lote sin desborde, sin errores de consola y sin imágenes rotas");
process.exit(problemas.length ? 1 : 0);
