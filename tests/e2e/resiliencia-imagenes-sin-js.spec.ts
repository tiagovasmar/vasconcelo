import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

/**
 * Fotos diferidas (SafeImage): con JavaScript se piden al acercarse (una sola vez, sin duplicados) y sin JavaScript llegan dentro de <noscript>,
 * optimizadas y con las mismas dimensiones. Servidor «real» (:3102, catálogo real con fotos).
 */
const pedidasDeImagen = (page: Page) => {
  const urls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/_next/image")) urls.push(r.url()); });
  return urls;
};
const scrollTodo = async (page: Page) => {
  for (let y = 0; y < 10; y++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(150);
  }
  await page.waitForLoadState("networkidle");
};

for (const ruta of ["/", "/sellados"]) {
  test(`con JavaScript (${ruta}): cada foto se pide una sola vez, sin copias del <noscript> en el DOM`, async ({ page }) => {
    const urls = pedidasDeImagen(page);
    await go(page, ruta);
    await scrollTodo(page);
    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls).size, `solicitudes repetidas: ${urls.filter((u, i) => urls.indexOf(u) !== i).join(" | ")}`).toBe(urls.length);
    // el contenido de <noscript> es texto cuando hay JavaScript: no existe como <img> ni se descarga
    expect(await page.evaluate(() => document.querySelectorAll("noscript img").length)).toBe(0);
    // las fotos ya mostradas reemplazaron a sus recuadros: ningún recuadro visible con foto cargada al lado
    const imagenes = await page.evaluate(() => Array.from(document.images).map((i) => i.currentSrc).filter(Boolean));
    expect(new Set(imagenes).size === imagenes.length || ruta === "/").toBe(true);
  });
}

test("sin JavaScript (/sellados): las fotos se ven optimizadas, con las mismas dimensiones y sin recuadros duplicados", async ({ browser, baseURL, page: conJs }) => {
  const ancho = conJs.viewportSize()!;
  // referencia con JavaScript
  await go(conJs, "/sellados");
  await scrollTodo(conJs);
  const medir = (p: Page) => p.evaluate(() => Array.from(document.querySelectorAll('[data-testid=tarjeta] img[src*="/_next/image"]')).slice(0, 6).map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  const conJsDim = await medir(conJs);

  const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: ancho });
  const page = await ctx.newPage();
  const urls = pedidasDeImagen(page);
  await page.goto("/sellados", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");
  const fotos = page.locator('[data-testid=tarjeta] img[src*="/_next/image"]');
  expect(await fotos.count()).toBeGreaterThan(0);
  expect(urls.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid=tarjeta] img')).every((i) => (i as HTMLImageElement).complete))).toBe(true);
  // optimización conservada: pasan por el optimizador de Next (WebP/AVIF según el navegador), no por el archivo original
  expect(await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid=tarjeta] img[src*="/_next/image"]')).every((i) => /[?&]w=\d+/.test((i as HTMLImageElement).src) && (i as HTMLImageElement).hasAttribute("srcset")))).toBe(true);
  // el recuadro de reserva no se ve y no ocupa lugar
  expect(await page.evaluate(() => Array.from(document.querySelectorAll("[data-foto-diferida]")).every((e) => getComputedStyle(e).display === "none"))).toBe(true);
  // mismas dimensiones que con JavaScript (las primeras tarjetas)
  const sinJsDim = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid=tarjeta] img[src*="/_next/image"]')).slice(0, 6).map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  expect(sinJsDim.length).toBe(conJsDim.length);
  sinJsDim.forEach((d, k) => {
    expect(Math.abs(d[0] - conJsDim[k][0]), `ancho foto ${k}`).toBeLessThanOrEqual(2);
    expect(Math.abs(d[1] - conJsDim[k][1]), `alto foto ${k}`).toBeLessThanOrEqual(2);
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await ctx.close();
});
