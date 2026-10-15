// Capturas de la corrección: retiro sin envío y carrusel continuo (en plena transición, en escritorio y celular). BASE=http://localhost:3200
import fs from "node:fs";
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = "docs/capturas/tanda7b";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const kind of ["escritorio", "movil"]) {
  const o = kind === "movil" ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1360, height: 900 } };
  const ctx = await browser.newContext({ ...o, reducedMotion: "no-preference", extraHTTPHeaders: { "x-forwarded-for": `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.locator("html[data-hydrated='true']").waitFor();
  await page.getByTestId("carrusel-pausa").click();
  await page.getByTestId("carrusel").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${kind}-carrusel-1-primero.png` });
  await page.getByTestId("carrusel-anterior").click(); // primero → último
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${OUT}/${kind}-carrusel-2-anterior-desde-el-primero-a-medio-camino.png` });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${kind}-carrusel-3-ultimo.png` });
  await page.getByTestId("carrusel-siguiente").click(); // último → primero, hacia adelante
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${OUT}/${kind}-carrusel-4-siguiente-desde-el-ultimo-a-medio-camino.png` });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${kind}-carrusel-5-vuelve-al-primero.png` });
  // Retiro / Andreani en el pedido.
  await page.evaluate(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "mega-symphonia-caja", quantity: 1, priceMinor: 16900000, mode: "buy", title: "Mega Symphonia · Caja de 30 sobres" }], delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null })));
  await page.goto(BASE + "/carrito");
  await page.locator("html[data-hydrated='true']").waitFor();
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.locator("#resumen").scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${kind}-pedido-retiro-sin-envio.png`, fullPage: true });
  await page.getByLabel(/^Andreani/).check();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${kind}-pedido-andreani-con-envio.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log("listo");
