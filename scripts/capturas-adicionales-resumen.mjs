// Capturas de verificación: bloque completo de adicionales de la ficha (cápsulas, precios tachados, descuentos, accesorios con stock de prueba y desglose).
//   BASE=http://localhost:3211 node scripts/capturas-adicionales-resumen.mjs      (vista previa local con catálogo y base de PRUEBA)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3211";
const OUT = "docs/capturas/adicionales";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [tag, width, height, mobile] of [["escritorio", 1360, 1300, false], ["movil-390", 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/productos/storm-emeralda-caja`, { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated='true']").waitFor();
  // selección: dos tipos de sobres (uno con 3 y otro con 2), una sleeve y un top loader
  await page.getByTestId("adicional-elegir-storm-sobre").click();
  await page.getByTestId("adicional-mas-storm-sobre").click();
  await page.getByTestId("adicional-mas-storm-sobre").click();
  await page.getByTestId("adicional-elegir-parcial-sobre").click();
  await page.getByTestId("adicional-mas-parcial-sobre").click();
  await page.getByTestId("adicional-elegir-sleeves-transparentes-pack-5").click();
  await page.getByTestId("adicional-elegir-top-loaders-transparentes-pack-5").click();
  await page.getByTestId("desglose-total").waitFor();
  await page.waitForTimeout(2500);
  const a = await page.getByTestId("adicionales-sobres").boundingBox();
  const z = await page.getByTestId("agregar").boundingBox();
  const top = Math.max(0, a.y - 70);
  const clip = { x: 0, y: top, width, height: Math.min(z.y + z.height + 24 - top, 6000) };
  if (mobile) {
    // en el celular: bloque completo en una sola imagen alta
    await page.screenshot({ path: `${OUT}/verificacion-${tag}.png`, fullPage: true, clip });
  } else {
    await page.screenshot({ path: `${OUT}/verificacion-${tag}.png`, fullPage: true, clip: { x: 740, y: top, width: width - 740, height: clip.height } });
  }
  await ctx.close();
}
await browser.close();
console.log("ok");
