// Capturas de la promoción caja + sobres, los accesorios y las recomendaciones del carrito (vista previa local con catálogo y base de PRUEBA).
//   BASE=http://localhost:3211 node scripts/capturas-combo.mjs      (requiere SKIP_ENV_FILES=1 npx tsx --conditions=react-server scripts/preview-combo.ts)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3211";
const OUT = "docs/capturas/combo";
fs.mkdirSync(OUT, { recursive: true });
const pass = /Contraseña: (\S+)/.exec(fs.readFileSync(".local/preview-combo-acceso.txt", "utf8"))[1];
const browser = await chromium.launch();
const KEY = "tienda-carrito-v1";
const cart = (items) => ({ items, delivery: {}, payment: "", contactName: "", idem: null });
const caja = (q = 1) => ({ productId: "storm-caja", quantity: q, priceMinor: 18500000 });
const sobre = (id, q, priceMinor) => ({ productId: id, quantity: q, priceMinor });

async function ctxFor(width, admin = false) {
  const mobile = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  if (admin) {
    const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: "dueno-local@example.com", password: pass }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error("no se pudo ingresar al panel de la vista previa");
  }
  return ctx;
}
async function seeded(ctx, items, path = "/") {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.evaluate(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.removeItem("tienda-recomendaciones-ocultas"); }, [KEY, cart(items)]);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  return page;
}
const openDrawer = async (page) => { await page.locator("[data-cart-trigger]").first().click(); await page.getByTestId("cart-drawer").waitFor(); await page.waitForTimeout(900); };

// Escritorio: panel con sugerencias y panel con combo aplicado
{
  const ctx = await ctxFor(1360);
  let page = await seeded(ctx, [caja(1)]);
  await openDrawer(page);
  await page.screenshot({ path: `${OUT}/panel-sugerencias-escritorio.png` });
  await page.getByTestId("reco-agregar-parcial-sobre").click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/panel-combo-aplicado-escritorio.png` });
  page = await seeded(ctx, [caja(1), sobre("storm-sobre", 6, 950000), { productId: "sleeves-transparentes-pack-5", quantity: 2, priceMinor: 100000 }], "/carrito");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/carrito-combo-escritorio.png`, fullPage: true });
  await page.getByRole("radio", { name: /Transferencia/ }).check();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/carrito-transferencia-escritorio.png`, fullPage: true });
  await page.goto(`${BASE}/productos/sleeves-transparentes-pack-5`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/ficha-sleeves-escritorio.png`, fullPage: true });
  await page.goto(`${BASE}/productos/top-loaders-transparentes-pack-5`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/ficha-top-loaders-escritorio.png`, fullPage: true });
  await page.goto(`${BASE}/sellados?formato=accesorios`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/catalogo-accesorios-escritorio.png` });
  await ctx.close();
}
// Móvil 360 / 390 / 430
for (const w of [360, 390, 430]) {
  const ctx = await ctxFor(w);
  const page = await seeded(ctx, [caja(1)]);
  await openDrawer(page);
  await page.screenshot({ path: `${OUT}/panel-sugerencias-${w}.png` });
  await page.getByTestId("reco-agregar-parcial-sobre").click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/panel-combo-aplicado-${w}.png` });
  await ctx.close();
}
// Panel del dueño
{
  const ctx = await ctxFor(1360, true);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/promociones`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/admin-promociones.png`, fullPage: true });
  await page.goto(`${BASE}/admin?q=transparentes`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/admin-accesorios.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(fs.readdirSync(OUT).join("\n"));
