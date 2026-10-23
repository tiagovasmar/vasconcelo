// Capturas de «Ver más» del selector de sobres (vista previa local con catálogo de PRUEBA y 12 sobres extra).
//   DEMO_EXTRA_BOOSTERS=12 SKIP_ENV_FILES=1 npx tsx --conditions=react-server scripts/preview-combo.ts
//   BASE=http://localhost:3211 node scripts/capturas-ver-mas.mjs
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3211";
const OUT = "docs/capturas/adicionales";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const [tag, width, height, mobile] of [["escritorio", 1360, 1000, false], ["movil-360", 360, 800, true], ["movil-390", 390, 844, true]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/productos/storm-emeralda-caja`, { waitUntil: "networkidle" });
  await page.locator("html[data-hydrated='true']").waitFor();
  const caps = page.locator("[data-testid=adicionales-sobres] ul > li");
  const shot = async (name) => {
    const sy = await page.evaluate(() => window.scrollY);
    const a = await page.getByTestId("adicionales-sobres").boundingBox();
    const y = Math.max(0, a.y + sy - 16);
    const h = Math.min(a.height + 32, 3000);
    const clip = mobile ? { x: 0, y, width, height: h } : { x: 740, y, width: width - 740, height: h };
    await page.screenshot({ path: `${OUT}/ver-mas-${name}-${tag}.png`, fullPage: true, clip });
  };
  // 1) contraído: 6 de N, con «Ver N más»
  await page.getByTestId("adicionales-sobres").scrollIntoViewIfNeeded();
  const ids = await caps.evaluateAll((els) => els.map((e) => e.dataset.testid.replace("adicional-", "")));
  await page.getByTestId(`adicional-elegir-${ids[0]}`).click();
  await page.getByTestId(`adicional-mas-${ids[0]}`).click();
  await page.getByTestId(`adicional-elegir-${ids[1]}`).click();
  await page.waitForTimeout(500);
  await shot("contraido");
  // 2) expandido: todas las opciones, con lo elegido conservado; se elige además una oculta
  await page.getByTestId("adicionales-ver-mas").click();
  await page.waitForTimeout(400);
  const todos = await caps.evaluateAll((els) => els.map((e) => e.dataset.testid.replace("adicional-", "")));
  await page.getByTestId(`adicional-elegir-${todos[todos.length - 1]}`).click();
  await page.waitForTimeout(2500);
  await shot("expandido");
  console.log(tag, "opciones:", todos.length);
  await ctx.close();
}
await browser.close();
