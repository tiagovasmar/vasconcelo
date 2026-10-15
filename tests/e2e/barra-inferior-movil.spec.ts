import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Barra inferior móvil de la ficha y panel lateral: al agregar se abre el panel y NINGUNA barra ni aviso flotante tapa sus controles.
test("ficha móvil: al agregar desde la barra inferior se abre el panel y sus botones quedan alcanzables", async ({ page, isMobile }) => {
  test.skip(!isMobile, "la barra inferior es solo del celular");
  await go(page, "/productos/set-de-ejemplo-sobre");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const barra = page.getByTestId("barra-compra");
  await expect(barra).toBeVisible();
  await barra.getByRole("button", { name: /Sumar 1 al pedido/ }).click();
  const panel = page.getByTestId("cart-drawer");
  await expect(panel).toBeVisible();
  // El botón de continuar es lo que se toca en el punto donde está dibujado (no lo cubre la barra ni ningún aviso).
  for (const name of [/Continuar con el pedido/, /Cerrar el carrito/]) {
    const el = panel.getByRole(name === undefined ? "button" : "link", { name }).or(panel.getByRole("button", { name }));
    const box = (await el.first().boundingBox())!;
    const dentro = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-testid="cart-drawer"]'), [box.x + box.width / 2, box.y + box.height / 2]);
    expect(dentro, `${name} queda a la vista y sin tapar`).toBe(true);
  }
  // El fondo no se desplaza mientras el panel está abierto.
  const antes = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.scrollY)).toBe(antes);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
});

test("ficha en escritorio: no hay barra inferior", async ({ page, isMobile }) => {
  test.skip(isMobile, "solo escritorio");
  await go(page, "/productos/set-de-ejemplo-sobre");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByTestId("barra-compra")).toBeHidden();
});
