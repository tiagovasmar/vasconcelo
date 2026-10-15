import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL. Galería de la ficha: fuentes separadas (fabricante / tienda / cartas ilustrativas), caja abierta identificada.
test("ficha de caja: foto de referencia del fabricante primero, caja abierta de exhibición identificada y sin fotos de la tienda inventadas", async ({ page }) => {
  await go(page, "/productos/inferno-x-caja");
  const etiqueta = page.getByTestId("galeria-etiqueta");
  await expect(etiqueta).toContainText("Foto de referencia del fabricante");
  await expect(etiqueta).toContainText("Caja cerrada");
  await expect(etiqueta).not.toContainText("Foto real del stock");
  await expect(page.getByTestId("galeria-exhibicion")).toHaveCount(0);
  await expect(page.getByTestId("galeria-sin-fotos-tienda")).toContainText("Todavía no hay fotos del stock real");

  // segunda vista: la exhibición abierta, aclarada como no representativa del artículo vendido
  const miniaturas = page.getByRole("list", { name: "Miniaturas" }).getByRole("button");
  await expect(miniaturas).toHaveCount(2); // sin relleno: solo las dos fotos oficiales distintas
  await miniaturas.nth(1).click();
  await expect(etiqueta).toContainText("Caja abierta de exhibición");
  await expect(page.getByTestId("galeria-exhibicion")).toContainText("no es el estado del artículo que se vende");
  const principal = page.locator("img[alt*='abierta: presentación de exhibición']").first();
  await expect(principal).toBeVisible();

  // las dos fotos son archivos distintos de la misma colección
  // las miniaturas se cargan de forma diferida: se espera a que todas tengan archivo (antes la lectura podía ser anterior a la carga)
  const leer = () => page.getByRole("list", { name: "Miniaturas" }).locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)));
  await expect.poll(async () => (await leer()).every((s) => s !== "")).toBe(true);
  const srcs = await leer();
  expect(new Set(srcs).size).toBe(2);
  expect(srcs.every((s) => s.includes("/inferno-x/"))).toBe(true);

  // el zoom aclara de quién es la foto
  await page.getByRole("button", { name: "Ampliar", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Foto de referencia del fabricante");
  await expect(page.getByRole("dialog")).toContainText("Caja abierta de exhibición");
  await page.keyboard.press("Escape");
});

test("ficha de sobre: una sola foto oficial (frente), sin miniaturas de relleno y con la aclaración de referencia", async ({ page }) => {
  await go(page, "/productos/black-bolt-sobre");
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("Foto de referencia del fabricante");
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("Frente");
  await expect(page.getByRole("list", { name: "Miniaturas" })).toHaveCount(0);
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("no acredita el estado ni el sellado");
});

test("las cartas de la expansión se presentan como ilustrativas y no como contenido garantizado, separadas de las fotos del producto", async ({ page }) => {
  await go(page, "/productos/storm-emeralda-caja");
  const seccion = page.locator("#cartas");
  await expect(seccion.getByRole("heading", { level: 2 })).toHaveText("Cartas ilustrativas de la expansión");
  await expect(seccion).toContainText("no contenido garantizado");
  await expect(page.getByRole("link", { name: "Cartas ilustrativas" })).toHaveAttribute("href", "#cartas");
  // la galería del producto no mezcla cartas: ninguna miniatura es de /cards/
  const srcs = await page.getByRole("list", { name: "Miniaturas" }).locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)));
  expect(srcs.every((s) => !s.includes("/cards/"))).toBe(true);
});
