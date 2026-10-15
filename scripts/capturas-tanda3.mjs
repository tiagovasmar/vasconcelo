// Capturas de la tanda 3 (banner móvil, fichas simplificadas, garantías por caja, White Flare/Black Bolt sin fondo blanco).
//   node scripts/capturas-tanda3.mjs antes|despues     (servidor con el catálogo real en BASE, por defecto http://localhost:3000)
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3000";
const fase = process.argv[2] ?? "despues";
const OUT = `docs/capturas/tanda3/${fase}`;
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const problemas = [];
const fichas = [["caja-japonesa-whiteflare", "/productos/white-flare-caja"], ["caja-japonesa-blackbolt", "/productos/black-bolt-caja"], ["caja-japonesa-storm", "/productos/storm-emeralda-caja"], ["sobre-japones-storm", "/productos/storm-emeralda-sobre"], ["kit-chino", "/productos/zh-kit-mengleigu-ex"], ["sobre-chino", "/productos/zh-gongzhu-rongguang-sobre-5"]];
for (const w of [320, 390, 430]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w === 320 ? 720 : 844 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.locator("html[data-hydrated='true']").waitFor();
  const medidas = [];
  for (const id of ["storm-emeralda", "30th-celebration", "abyss-eye", "mega-dream-ex", "inferno-x", "heat-wave-arena", "white-flare", "black-bolt"]) {
    await page.getByTestId(`indicador-${id}`).click();
    await page.waitForTimeout(700);
    await page.evaluate(async () => { await Promise.all([...document.querySelectorAll("[data-active=true] img")].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))); });
    const m = await page.evaluate(() => { const c = document.querySelector("[data-testid=carrusel]").getBoundingClientRect(); const h = document.querySelector("header")?.getBoundingClientRect(); const d = document.querySelector("[data-active=true]"); const btn = document.querySelector("[data-testid=carrusel-pausa]").getBoundingClientRect(); const scrolls = document.documentElement.scrollWidth - innerWidth; return { banner: Math.round(c.height), header: Math.round(h?.bottom ?? 0), controlesBottom: Math.round(btn.bottom + scrollY), alto: innerHeight, scrolls, textoCortado: [...d.querySelectorAll("h2,p,a")].some((e) => e.scrollWidth > e.clientWidth + 1) }; });
    medidas.push({ id, ...m });
    if (id === "storm-emeralda" || id === "white-flare" || id === "black-bolt") await page.locator("[data-testid=carrusel]").screenshot({ path: `${OUT}/banner-${id}-${w}.png` });
  }
  console.log(w, JSON.stringify(medidas.map((m) => [m.id, m.banner])), "header", medidas[0].header, "controles", medidas[0].controlesBottom, "alto", medidas[0].alto);
  for (const m of medidas) { if (m.scrolls > 0) problemas.push(`${w} ${m.id}: desborde`); if (m.textoCortado) problemas.push(`${w} ${m.id}: texto cortado`); }
  const hs = new Set(medidas.map((m) => m.banner)); if (hs.size > 1) problemas.push(`${w}: alturas distintas ${[...hs]}`);
  await page.goto(BASE + "/");
  await page.screenshot({ path: `${OUT}/home-${w}.png` });
  if (w === 390) {
    for (const [n, u] of fichas) {
      await page.goto(BASE + u); await page.locator("html[data-hydrated='true']").waitFor();
      const y = await page.evaluate(() => Math.round(document.querySelector("h1").getBoundingClientRect().top + scrollY));
      console.log("h1 y", n, y);
      await page.screenshot({ path: `${OUT}/ficha-${n}-${w}.png`, fullPage: true });
      await page.screenshot({ path: `${OUT}/ficha-${n}-${w}-primera-pantalla.png` });
    }
    await page.goto(BASE + "/sellados?q=white+flare"); await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/catalogo-whiteflare-blackbolt-${w}.png`, fullPage: true });
  }
  await ctx.close();
}
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
for (const [n, u] of [["home", "/"], ...fichas, ["catalogo-whiteflare-blackbolt", "/sellados?q=white+flare"], ["catalogo-blackbolt", "/sellados?q=black+bolt"]]) {
  await page.goto(BASE + u); await page.locator("html[data-hydrated='true']").waitFor();
  await page.evaluate(async () => { const im = [...document.images]; im.forEach((i) => (i.loading = "eager")); await Promise.all(im.map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${n.startsWith("caja") || n.startsWith("sobre") || n.startsWith("kit") ? "ficha-" : ""}${n}-1440.png`, fullPage: true });
}
await page.goto(BASE + "/"); await page.locator("html[data-hydrated='true']").waitFor();
for (const id of ["white-flare", "black-bolt"]) { await page.getByTestId(`indicador-${id}`).click(); await page.waitForTimeout(900); await page.locator("[data-testid=carrusel]").screenshot({ path: `${OUT}/banner-${id}-1440.png` }); }
await browser.close();
console.log(problemas.length ? "PROBLEMAS:\n" + problemas.join("\n") : "OK");
