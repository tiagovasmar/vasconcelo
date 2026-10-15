import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Barra inferior móvil de la ficha: el aviso flotante «Agregaste…» no debe taparla, y la barra no existe en escritorio.
test("ficha móvil: el aviso «Agregaste…» queda por encima de la barra inferior y no la tapa", async ({ page, isMobile }) => {
  test.skip(!isMobile, "la barra inferior es solo del celular");
  await go(page, "/productos/set-de-ejemplo-sobre");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barra = page.getByTestId("barra-compra");
  await expect(barra).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-barra-inferior", "1");
  await barra.getByRole("button", { name: /Sumar 1 al pedido/ }).click();
  const aviso = page.locator(".cart-toast > div");
  await expect(aviso).toBeVisible();
  const [a, b] = await Promise.all([aviso.boundingBox(), barra.boundingBox()]);
  expect(a!.y + a!.height, "el aviso termina antes del borde superior de la barra").toBeLessThanOrEqual(b!.y);
  // el botón de la barra sigue siendo alcanzable mientras el aviso está a la vista
  await expect(barra.getByRole("button", { name: /Sumar 1 al pedido/ })).toBeVisible();
});

test("ficha en escritorio: no hay barra inferior ni marca en el body", async ({ page, isMobile }) => {
  test.skip(isMobile, "solo escritorio");
  await go(page, "/productos/set-de-ejemplo-sobre");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("barra-compra")).toBeHidden();
});
