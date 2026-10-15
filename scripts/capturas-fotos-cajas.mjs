// Antes / después de las fotos de caja cerrada (Ninja Spinner, Nihil Zero, Mega Symphonia, Team Rocket) y capturas de portada, miniaturas y ampliación.
//   BASE=http://localhost:3501 node scripts/capturas-fotos-cajas.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3501";
const out = "docs/capturas/tarjetas";
fs.mkdirSync(out, { recursive: true });
const ids = ["ninja-spinner", "nihil-zero", "mega-symphonia", "glory-of-team-rocket"];
// Comparación: arriba el original oficial (1500×1500, fondo blanco), abajo el derivado (transparente, recortado), ambos sobre el fondo crema de la tarjeta.
const W = 420;
const cells = [];
for (const [i, id] of ids.entries()) {
  const antes = await sharp(`recursos-originales/japon-cajas/${id}-closed-original.webp`).resize(W, W).png().toBuffer();
  const meta = await sharp(`public/images/products/japon-cajas/${id}-closed-v2.webp`).metadata();
  const h = Math.round((W * meta.height) / meta.width);
  const despues = await sharp({ create: { width: W, height: W, channels: 3, background: "#ece6d4" } })
    .composite([{ input: await sharp(`public/images/products/japon-cajas/${id}-closed-v2.webp`).resize(W, h).png().toBuffer(), left: 0, top: Math.round((W - h) / 2) }]).png().toBuffer();
  cells.push({ input: antes, left: i * (W + 10), top: 0 }, { input: despues, left: i * (W + 10), top: W + 10 });
}
await sharp({ create: { width: ids.length * (W + 10), height: 2 * W + 10, channels: 3, background: "#888" } }).composite(cells).png().toFile(`${out}/fotos-cajas-antes-y-despues.png`);

const browser = await chromium.launch();
for (const [name, viewport] of [["escritorio", { width: 1360, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: BASE });
  const page = await ctx.newPage();
  for (const id of ["nihil-zero-caja", "mega-symphonia-caja"]) {
    await page.goto(`/productos/${id}`, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/despues-${name}-portada-miniaturas-${id}.png` });
    await page.getByRole("button", { name: "Ampliar", exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/despues-${name}-ampliacion-${id}.png` });
    await page.keyboard.press("Escape");
  }
  await ctx.close();
}
await browser.close();
console.log("ok");
