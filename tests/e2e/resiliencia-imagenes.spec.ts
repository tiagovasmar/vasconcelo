import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

/**
 * Imágenes que figuran como existentes (manifiesto de /public o Storage) pero NO se pueden descargar: 404, error 500 del optimizador o red cortada.
 * Servidor «real» (:3102, catálogo real con fotos). La ilustración de reserva ocupa el mismo recuadro, conserva el texto alternativo y no se reintenta en bucle.
 */
const fotosDeTarjetas = (page: Page) => page.locator('[data-testid=tarjeta] img[src*="/_next/image"]');
const rotas = (page: Page) => page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).length);
const scrollTodo = async (page: Page) => {
  for (let y = 0; y < 6; y++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
};

for (const [nombre, respuesta] of [
  ["404", (r: import("@playwright/test").Route) => r.fulfill({ status: 404, contentType: "text/plain", body: "no" })],
  ["500", (r: import("@playwright/test").Route) => r.fulfill({ status: 500, contentType: "text/plain", body: "error" })],
  ["red cortada", (r: import("@playwright/test").Route) => r.abort("connectionreset")],
] as const) {
  test(`catálogo con fotos que fallan (${nombre}): se ve la ilustración de reserva, mismo tamaño, sin imágenes rotas ni reintentos`, async ({ page, browser, baseURL }) => {
    // Referencia: la misma página con todas las fotos bien, en un contexto aparte.
    const base = await (await browser.newContext({ baseURL, viewport: page.viewportSize() ?? undefined })).newPage();
    await go(base, "/sellados");
    await scrollTodo(base);
    const conFoto = await fotosDeTarjetas(base).count();
    expect(conFoto).toBeGreaterThan(0);
    const altoBase = (await base.getByTestId("tarjeta").first().boundingBox())!.height;
    const anchoBase = (await base.getByTestId("tarjeta").first().boundingBox())!.width;
    await base.context().close();

    const pedidos = new Map<string, number>();
    await page.route("**/_next/image**", (r) => {
      pedidos.set(r.request().url(), (pedidos.get(r.request().url()) ?? 0) + 1);
      return respuesta(r);
    });
    await go(page, "/sellados");
    await scrollTodo(page);
    await expect(fotosDeTarjetas(page)).toHaveCount(0); // ninguna foto quedó en pantalla…
    expect(await rotas(page)).toBe(0); // …ni hay imágenes rotas…
    expect(await page.locator("[data-testid=tarjeta] [role=img][aria-label]").count()).toBeGreaterThanOrEqual(conFoto); // …en su lugar, la ilustración con su texto alternativo
    const caja = (await page.getByTestId("tarjeta").first().boundingBox())!;
    expect(Math.abs(caja.height - altoBase)).toBeLessThanOrEqual(1); // sin saltos de diseño
    expect(Math.abs(caja.width - anchoBase)).toBeLessThanOrEqual(1);
    // Sin bucles: nada más se pide pasado un rato, y cada dirección se pidió pocas veces (imagen y precarga, como máximo).
    const total = () => [...pedidos.values()].reduce((a, b) => a + b, 0);
    const t0 = total();
    await page.waitForTimeout(2500);
    expect(total()).toBe(t0);
    expect(Math.max(...pedidos.values())).toBeLessThanOrEqual(2);
  });
}

test("ficha de producto con la foto principal rota: ilustración de reserva con el mismo texto alternativo y sin imágenes rotas", async ({ page }) => {
  await page.route("**/_next/image**", (r) => r.fulfill({ status: 404, contentType: "text/plain", body: "no" }));
  await go(page, "/productos/storm-emeralda-caja");
  await scrollTodo(page);
  expect(await rotas(page)).toBe(0);
  const reserva = page.locator("main [role=img][aria-label]");
  await expect(reserva.first()).toBeVisible();
  expect(await reserva.first().getAttribute("aria-label")).toMatch(/Storm Emeralda/i);
});
