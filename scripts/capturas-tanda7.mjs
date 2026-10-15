// Capturas de la tanda 7 (carrito lateral, pedido, retiro, ventas, avatar) en escritorio y celular, sobre el servidor local y la base de DESARROLLO.
//   BASE=http://localhost:3200 node scripts/capturas-tanda7.mjs      (requiere npm run dev:db, npm run dev:admin y el servidor de producción local en marcha)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = "docs/capturas/tanda7";
fs.mkdirSync(OUT, { recursive: true });
const adminPass = fs.readFileSync(".local/dev-admin.txt", "utf8").trim();
const browser = await chromium.launch();

async function ctxFor(kind, admin = false) {
  const opts = kind === "movil" ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1360, height: 900 } };
  const ctx = await browser.newContext({ ...opts, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  if (admin) {
    const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: "admin-dev@example.com", password: adminPass }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error("no se pudo ingresar al panel de prueba");
  }
  return ctx;
}
const ready = async (page) => { await page.locator("html[data-hydrated='true']").waitFor({ timeout: 30000 }); await page.waitForTimeout(500); };
const shot = (page, name, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });

for (const kind of ["escritorio", "movil"]) {
  const ctx = await ctxFor(kind);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sellados`, { waitUntil: "load" });
  await ready(page);
  await shot(page, `${kind}-01-cabecera-catalogo`);
  // Agregar desde una tarjeta: el panel se abre solo.
  const botones = page.getByRole("button", { name: /^Agregar .* al carrito$/ });
  await botones.first().scrollIntoViewIfNeeded();
  await botones.first().click();
  await page.locator('[data-testid="cart-drawer"]').waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await shot(page, `${kind}-02-panel-tras-agregar`);
  // Segundo producto desde la ficha (cierra, abre ficha, agrega).
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/productos/mega-symphonia-caja`, { waitUntil: "load" });
  await ready(page);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.locator('[data-testid="cart-drawer"]').waitFor({ state: "visible" });
  await page.waitForTimeout(700);
  await shot(page, `${kind}-03-panel-dos-productos`);
  // Continuar con el pedido.
  await page.locator('[data-testid="drawer-continuar"]').click();
  await page.waitForURL("**/carrito");
  await ready(page);
  await page.waitForTimeout(800);
  await shot(page, `${kind}-04-pedido`, true);
  // Intentar continuar sin datos: errores junto a cada campo.
  await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
  await page.waitForTimeout(500);
  await shot(page, `${kind}-05-pedido-errores`, true);
  // Retiro: aviso único.
  await page.getByLabel("Nombre y apellido").fill("Ana Pérez");
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="aviso-retiro"]').scrollIntoViewIfNeeded();
  await shot(page, `${kind}-06-retiro`);
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.waitForTimeout(300);
  await shot(page, `${kind}-07-pedido-completo`, true);
  await ctx.close();
}

// Panel del dueño: ventas.
for (const kind of ["escritorio", "movil"]) {
  const ctx = await ctxFor(kind, true);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/ventas`, { waitUntil: "load" });
  await ready(page);
  await page.getByLabel(/Agregar producto/).fill("Mega Symphonia");
  await page.locator('[data-testid^="agregar-venta-"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('[data-testid="venta-pago"]').selectOption("transferencia");
  await page.locator('[data-testid="venta-nota"]').fill("Venta en persona");
  await shot(page, `${kind}-10-admin-ventas-armar`, true);
  await page.locator('[data-testid="revisar-venta"]').click();
  await page.locator('[data-testid="venta-resumen"]').waitFor();
  await shot(page, `${kind}-11-admin-ventas-resumen`, true);
  await ctx.close();
}

// Cabecera con «Mi cuenta» en celular y escritorio.
for (const kind of ["escritorio", "movil"]) {
  const ctx = await ctxFor(kind);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await ready(page);
  await page.locator("header").first().screenshot({ path: `${OUT}/${kind}-12-cabecera-mi-cuenta.png` });
  await ctx.close();
}
await browser.close();
console.log(`Capturas en ${OUT}`);
