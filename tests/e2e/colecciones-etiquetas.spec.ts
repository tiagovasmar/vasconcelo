import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL. Etiquetas de colección (nombre · código, con enlace) e idioma (escrito) en tarjetas y fichas.
const COLECCIONES: Array<[string, string]> = [
  ["black-bolt", "Black Bolt · SV11B"], ["white-flare", "White Flare · SV11W"], ["heat-wave-arena", "Heat Wave Arena · SV9a"], ["inferno-x", "Inferno X · M2"],
  ["mega-dream-ex", "MEGA Dream ex · M2a"], ["30th-celebration", "30th CELEBRATION · M6a"], ["storm-emeralda", "Storm Emeralda · M6"], ["abyss-eye", "Abyss Eye · M5"],
];

test("cada tarjeta de producto muestra colección (nombre · código, enlazada) e idioma escrito, debajo de la imagen", async ({ page }) => {
  for (const [slug, texto] of COLECCIONES) {
    await go(page, `/expansiones/${slug}`);
    const tarjetas = page.locator("#exp-prods ~ ul > li article");
    await expect(tarjetas).toHaveCount(2);
    for (const t of await tarjetas.all()) {
      const col = t.getByTestId("etiqueta-coleccion");
      await expect(col).toHaveText(texto);
      await expect(col).toHaveAttribute("href", `/expansiones/${slug}`);
      await expect(t.getByTestId("etiqueta-idioma")).toHaveText("Japonés");
      // quedan debajo de la imagen y antes del título
      const [img, tag, titulo] = await Promise.all([t.locator("a[aria-hidden=true]").boundingBox(), col.boundingBox(), t.getByRole("heading", { level: 3 }).boundingBox()]);
      expect(tag!.y).toBeGreaterThanOrEqual(img!.y + img!.height - 1);
      expect(titulo!.y).toBeGreaterThan(tag!.y);
    }
  }
});

test("catálogo: las etiquetas aparecen en todas las tarjetas y el enlace de la colección abre su detalle", async ({ page }) => {
  await go(page, "/sellados?idioma=ja");
  const tarjetas = page.locator("article");
  const n = await tarjetas.count();
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId("etiqueta-idioma")).toHaveCount(n);
  await expect(page.getByTestId("etiqueta-coleccion")).toHaveCount(n);
  await page.getByTestId("etiqueta-coleccion").first().click();
  await expect(page).toHaveURL(/\/expansiones\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("ficha: etiquetas de colección e idioma cerca del título, con los datos del catálogo", async ({ page }) => {
  await go(page, "/productos/storm-emeralda-caja");
  const h1 = page.getByRole("heading", { level: 1 });
  const etiquetas = page.getByTestId("etiquetas").first();
  await expect(etiquetas.getByTestId("etiqueta-coleccion")).toHaveText("Storm Emeralda · M6");
  await expect(etiquetas.getByTestId("etiqueta-coleccion")).toHaveAttribute("href", "/expansiones/storm-emeralda");
  await expect(etiquetas.getByTestId("etiqueta-idioma")).toHaveText("Japonés");
  const [t, e] = await Promise.all([h1.boundingBox(), etiquetas.boundingBox()]);
  expect(e!.y).toBeGreaterThan(t!.y);
  expect(e!.y - (t!.y + t!.height)).toBeLessThan(60); // pegadas al título
  await etiquetas.getByTestId("etiqueta-coleccion").click();
  await expect(page).toHaveURL(/\/expansiones\/storm-emeralda$/);
});

test("catálogo: las fichas sin colección única (kits) llevan igual el idioma escrito, sin etiqueta de colección", async ({ page }) => {
  await go(page, "/sellados?formato=kit");
  const tarjetas = page.locator("article");
  await expect(tarjetas).toHaveCount(3);
  await expect(page.getByTestId("etiqueta-idioma")).toHaveCount(3);
  for (const t of await page.getByTestId("etiqueta-idioma").all()) await expect(t).toHaveText("Chino simplificado");
  await expect(page.getByTestId("etiqueta-coleccion")).toHaveCount(0);
});

test("catálogo: las fichas chinas con colección muestran nombre original y código del envase, enlazados", async ({ page }) => {
  await go(page, "/sellados?expansion=zh-zhenshi-xuanxu");
  await expect(page.locator("article")).toHaveCount(1);
  for (const t of await page.getByTestId("etiqueta-coleccion").all()) {
    await expect(t).toHaveText("Arcane Truth · csv6C");
    await expect(t).toHaveAttribute("href", "/expansiones/zh-zhenshi-xuanxu");
  }
});
