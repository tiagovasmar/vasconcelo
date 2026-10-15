// Capturas de la tanda 4 (mayoristas, encargos, promociones con caja, títulos en español, fotos chinas, cartas destacadas más arriba).
//   node scripts/capturas-tanda4.mjs                    (catálogo REAL en BASE, por defecto http://localhost:3000)
//   DEMO=http://localhost:3201 node scripts/capturas-tanda4.mjs   (además: carrito con promoción, con el catálogo de PRUEBA)
//   node scripts/capturas-tanda4.mjs fotos               (solo la comparación de fotos antes/después, usando git HEAD como «antes»)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DEMO = process.env.DEMO ?? "";
const OUT = "docs/capturas/tanda4";
fs.mkdirSync(OUT, { recursive: true });

// --- Fotos reemplazadas: antes (commit anterior) y después (archivos actuales), lado a lado ---
async function fotos() {
  const pares = [
    ["太晶盛聚 · caja", "zh-taijing-shengju-caja-1.webp"],
    ["宝石包 VOL.6 · caja", "zh-baoshibao-vol6-caja-1.webp"],
    ["Set de ilustraciones Vol.3", "zh-30-zhounian-ilustraciones-vol3-1.webp"],
  ];
  const H = 520, W = 420, celdas = [];
  for (const [i, [titulo, f]] of pares.entries()) {
    const antes = execFileSync("git", ["show", `HEAD:public/images/products/zh/${f}`], { maxBuffer: 20_000_000 });
    const despues = fs.readFileSync(`public/images/products/zh/${f}`);
    for (const [j, buf] of [antes, despues].entries()) {
      const img = await sharp(buf).resize(W, H, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer();
      celdas.push({ input: img, left: i * (W + 20), top: 60 + j * (H + 40) });
    }
    const etiqueta = Buffer.from(`<svg width="${W}" height="54" xmlns="http://www.w3.org/2000/svg"><text x="0" y="24" font-size="22" font-family="sans-serif" font-weight="bold">${titulo}</text></svg>`);
    celdas.push({ input: etiqueta, left: i * (W + 20), top: 0 });
  }
  const filas = Buffer.from(`<svg width="60" height="${2 * H + 120}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="100" font-size="18" font-family="sans-serif" fill="#a00">ANTES</text><text x="0" y="${100 + H + 40}" font-size="18" font-family="sans-serif" fill="#070">DESPUÉS</text></svg>`);
  void filas;
  await sharp({ create: { width: pares.length * (W + 20), height: 60 + 2 * H + 40, channels: 3, background: "#e8e8e8" } }).composite(celdas).png().toFile(`${OUT}/fotos-antes-despues.png`);
  console.log("fotos: fila superior = antes (HEAD), fila inferior = después");
}
await fotos();
if (process.argv[2] === "fotos") process.exit(0);

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
  await pagina(ctx, `${BASE}/mayoristas`, `mayoristas-${nombre}`);
  await pagina(ctx, `${BASE}/mayoristas/solicitar`, `mayoristas-solicitar-visitante-${nombre}`);
  await pagina(ctx, `${BASE}/sellados?idioma=zh`, `catalogo-chino-${nombre}`);
  for (const [n, slug] of [["prismatic-taijing-caja", "zh-taijing-shengju-caja"], ["prismatic-taijing-sobre", "zh-taijing-shengju-sobre-10"], ["sparking-candidato-xingcai", "zh-xingcai-jingli-sobre-5"], ["baoshibao-vol6-caja", "zh-baoshibao-vol6-caja"], ["ilustraciones-vol3", "zh-30-zhounian-ilustraciones-vol3"]]) {
    await pagina(ctx, `${BASE}/productos/${slug}`, `ficha-${n}-${nombre}`);
  }
  // carrito con productos por encargo (catálogo real: todo pendiente)
  await pagina(ctx, `${BASE}/carrito`, `carrito-encargo-${nombre}`, {
    prep: async (page) => {
      await page.evaluate(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "zh-taijing-shengju-caja", quantity: 2, priceMinor: 0, mode: "encargo" }, { productId: "zh-taijing-shengju-sobre-10", quantity: 6, priceMinor: 0, mode: "encargo" }], delivery: { method: "retiro", locality: "", province: "", postalCode: "", pickupPoint: "haedo" }, payment: "coordinar", contactName: "", idem: null })));
      await page.reload();
      await page.locator("html[data-hydrated='true']").waitFor();
      await page.getByTestId("resumen-encargo").waitFor();
    },
  });
  await ctx.close();
}

if (DEMO) {
  for (const [nombre, viewport, movil] of [["escritorio", { width: 1440, height: 900 }, false], ["movil", { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", isMobile: movil, hasTouch: movil });
    const item = (id, quantity, priceMinor, mode = "buy") => ({ productId: id, quantity, priceMinor, mode });
    const carrito = (items, payment) => ({ items, delivery: { method: "retiro", locality: "", province: "", postalCode: "", pickupPoint: "haedo" }, payment, contactName: "", idem: null });
    for (const [n, items, payment] of [["sobres-solos", [item("storm-sobre", 3, 950000)], "coordinar"], ["caja-transferencia", [item("storm-caja", 1, 18500000), item("storm-sobre", 2, 950000)], "transferencia"], ["mixto-encargo", [item("storm-pack5", 1, 4200000), item("parcial-bundle", 1, 0, "encargo")], "coordinar"]]) {
      await pagina(ctx, `${DEMO}/carrito`, `demo-carrito-${n}-${nombre}`, {
        prep: async (page) => {
          await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), ["tienda-carrito-v1", carrito(items, payment)]);
          await page.reload();
          await page.locator("html[data-hydrated='true']").waitFor();
          await page.getByTestId("promo-estado").waitFor();
          await page.waitForTimeout(700);
        },
      });
    }
    await pagina(ctx, `${DEMO}/sellados`, `demo-catalogo-${nombre}`);
    await ctx.close();
  }
}
await browser.close();
console.log(problemas.length ? "PROBLEMAS:\n" + problemas.join("\n") : "OK: sin desborde, sin imágenes rotas y sin errores de consola");
