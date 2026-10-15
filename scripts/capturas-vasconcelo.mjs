// Capturas de la marca Vasconcelo, el carrusel automático y el catálogo chino (catálogo real), en escritorio y móvil, con comprobación de
// desborde, de imágenes rotas y de errores de consola. Requiere el servidor con el catálogo real en BASE (por defecto http://localhost:3000).
//   node scripts/capturas-vasconcelo.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas";
const rutas = [
  ["vc-inicio", "/"],
  ["vc-catalogo-chino", "/sellados?idioma=zh"],
  ["vc-catalogo-kits", "/sellados?formato=kit"],
  ["vc-catalogo-p5", "/sellados?pagina=5"],
  ["vc-expansiones", "/expansiones"],
  ["vc-expansion-gongzhu", "/expansiones/zh-gongzhu-rongguang"],
  ["vc-sobre-5-gongzhu", "/productos/zh-gongzhu-rongguang-sobre-5"],
  ["vc-sobre-20-gongzhu", "/productos/zh-gongzhu-rongguang-sobre-20"],
  ["vc-kit-mengleigu", "/productos/zh-kit-mengleigu-ex"],
  ["vc-kit-haipi", "/productos/zh-kit-haipi-zuhe"],
  ["vc-caja-ogerpon-agua", "/productos/zh-caja-ogerpon-agua"],
  ["vc-set-vol2", "/productos/zh-30-zhounian-ilustraciones-vol2"],
  ["vc-set-vol3", "/productos/zh-30-zhounian-ilustraciones-vol3"],
  ["vc-caja-taijing", "/productos/zh-taijing-shengju-caja"],
  ["vc-sobre-30-chino", "/productos/zh-30-zhounian-sobre-6"],
];
const sizes = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "movil", width: 390, height: 844 },
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
    await page.evaluate(async () => {
      const imgs = [...document.images];
      imgs.forEach((i) => (i.loading = "eager"));
      await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    await page.waitForTimeout(400);
    const rotas = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent !== null && !i.closest("[inert]")).map((i) => i.src));
    if (rotas.length) problemas.push(`${name} ${s.name}: imágenes rotas ${rotas.slice(0, 2).join(", ")}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) problemas.push(`${name} ${s.name}: desborde horizontal ${over}px`);
    if (errores.length) problemas.push(`${name} ${s.name}: errores de consola ${errores.join(" | ").slice(0, 160)}`);
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: true });
  }
  await ctx.close();

  // Carrusel con avance automático: se muestran tres momentos reales (0 s, ~6 s y ~12 s) y el botón de pausa.
  const c2 = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "no-preference" });
  const p2 = await c2.newPage();
  await p2.goto(BASE + "/");
  await p2.locator("html[data-hydrated='true']").waitFor();
  const activo = () => p2.evaluate(() => document.querySelector("[data-active=true]").getAttribute("data-testid"));
  const carrusel = p2.getByTestId("carrusel");
  await p2.mouse.move(2, 2);
  const a0 = await activo();
  await carrusel.screenshot({ path: `${OUT}/vc-carrusel-0s-${s.name}.png` });
  await p2.waitForFunction((a) => document.querySelector("[data-active=true]").getAttribute("data-testid") !== a, a0, { timeout: 9000 });
  await p2.waitForTimeout(1200);
  const a1 = await activo();
  await carrusel.screenshot({ path: `${OUT}/vc-carrusel-6s-${s.name}.png` });
  if (a1 === a0) problemas.push(`carrusel ${s.name}: no avanzó solo`);
  await p2.getByTestId("carrusel-pausa").click();
  await p2.mouse.move(2, 2);
  await p2.getByRole("link", { name: "Cómo comprar" }).first().focus();
  await p2.evaluate(() => window.scrollTo(0, 0));
  const pausadoEn = await activo();
  await p2.waitForTimeout(7000);
  if ((await activo()) !== pausadoEn) problemas.push(`carrusel ${s.name}: avanzó estando en pausa manual`);
  await carrusel.screenshot({ path: `${OUT}/vc-carrusel-pausa-${s.name}.png` });
  await c2.close();
}
await browser.close();
console.log(problemas.length ? "PROBLEMAS:\n" + problemas.join("\n") : "OK: capturas de Vasconcelo / catálogo chino sin desborde, sin errores de consola y sin imágenes rotas; el carrusel avanza solo y respeta la pausa");
process.exit(problemas.length ? 1 : 0);
