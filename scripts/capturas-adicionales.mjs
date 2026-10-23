// Capturas de los adicionales en la ficha de la caja (vista previa local con catálogo y base de PRUEBA).
//   BASE=http://localhost:3211 node scripts/capturas-adicionales.mjs      (requiere SKIP_ENV_FILES=1 npx tsx --conditions=react-server scripts/preview-combo.ts)
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3211";
const OUT = "docs/capturas/adicionales";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const FICHA = `${BASE}/productos/storm-emeralda-caja`;

async function open(width) {
  const mobile = width < 700;
  const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  await page.goto(FICHA, { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated='true']").waitFor();
  return { ctx, page };
}
const block = async (page, name, full = false) => {
  const el = page.getByTestId("adicionales").first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  if (full) await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
};

for (const w of [1360, 360, 390, 430]) {
  const tag = w > 700 ? "escritorio" : String(w);
  const { ctx, page } = await open(w);
  // 1) estado inicial: nada elegido
  await page.getByTestId("adicionales-sobres").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/ficha-inicial-${tag}.png` });
  // 2) con selección: sobres, protección y desglose del servidor
  await page.getByTestId("adicional-elegir-storm-sobre").click();
  await page.getByTestId("adicional-mas-storm-sobre").click();
  await page.getByTestId("adicional-mas-storm-sobre").click();
  await page.getByTestId("adicional-elegir-sleeves-transparentes-pack-5").click();
  await page.getByTestId("adicionales-desglose").getByTestId("desglose-total").waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId("adicionales-desglose").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/ficha-seleccion-${tag}.png` });
  // 3) agregado: carrito lateral con todo y el descuento
  await page.getByTestId("agregar").click();
  await page.getByTestId("cart-drawer").waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/carrito-lateral-${tag}.png` });
  await ctx.close();
}
await browser.close();
console.log(fs.readdirSync(OUT).join("\n"));
