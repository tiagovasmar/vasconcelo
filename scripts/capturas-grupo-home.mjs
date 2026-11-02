import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3010";
if (!["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)) throw new Error("Solo vista previa local");
const OUT = "docs/capturas/grupo-home";
const GROUP = "https://chat.whatsapp.com/J36bbxgvyLvAP1G54N5R5x";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [360, 390, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 1024, hasTouch: width < 1024, reducedMotion: "reduce" });
    let externalRequests = 0;
    await context.route("https://chat.whatsapp.com/**", (route) => { externalRequests++; return route.abort(); });
    const page = await context.newPage();
    await page.goto(BASE);
    await page.locator("html[data-hydrated=true]").waitFor();
    const block = page.getByTestId("grupo-whatsapp");
    const link = page.getByTestId("unirse-grupo-whatsapp");
    await block.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const href = await link.getAttribute("href");
    const rel = await link.getAttribute("rel");
    const target = await link.getAttribute("target");
    if (overflow > 0 || externalRequests || href !== GROUP || rel !== "noopener noreferrer" || target !== "_blank") throw new Error(`Fallo de captura a ${width}px`);
    await page.screenshot({ path: `${OUT}/inicio-${width}.png` });
    await block.screenshot({ path: `${OUT}/grupo-${width}.png` });
    results.push({ width, documentWidth: await page.evaluate(() => document.documentElement.scrollWidth), overflow, externalRequests, href, target, rel });
    await context.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(`${OUT}/INFORME.json`, JSON.stringify({ base: BASE, capturedAt: new Date().toISOString(), note: "Vista previa con datos ficticios. No se pulsa ni se contacta el grupo para las capturas.", results }, null, 2));
console.log("8 capturas de la vista previa: sin desborde ni solicitudes al grupo.");
