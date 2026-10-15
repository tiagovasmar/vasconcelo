import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL. Inicio: categorías primero, después las ocho expansiones.
test("inicio: Cajas y Sobres abren el catálogo filtrado; Packs es «Próximamente» y no enlaza", async ({ page }) => {
  await go(page, "/");
  const cat = page.locator("section[aria-labelledby=cat-title]");
  await expect(cat.getByTestId("categoria-cajas")).toHaveAttribute("href", "/sellados?formato=caja");
  await expect(cat.getByTestId("categoria-sobres")).toHaveAttribute("href", "/sellados?formato=sobre");
  const packs = cat.getByTestId("categoria-packs");
  await expect(packs).toContainText("Próximamente");
  expect(await packs.evaluate((n) => n.tagName)).not.toBe("A");
  await expect(cat.locator("a[href*='formato=pack']")).toHaveCount(0);
  // el orden: banner, categorías, cartas destacadas, colecciones (japonesas y chinas juntas); ya no hay una sección china aparte
  const order = await page.$$eval("main section[aria-labelledby]", (s) => s.map((x) => x.getAttribute("aria-labelledby")!));
  expect(order[0]).toBe("banner-title-storm-emeralda");
  expect(order.filter((x) => !x.startsWith("banner-title")).slice(0, 4)).toEqual(["cat-title", "cards-title", "collections-title", "feat-title"]);
  expect(order).not.toContain("zh-title");

  await cat.getByTestId("categoria-cajas").click();
  await expect(page).toHaveURL(/formato=caja/);
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–12 de 18 productos" })).toBeVisible(); // 14 japonesas + 4 chinas
  await go(page, "/");
  await page.locator("section[aria-labelledby=cat-title]").getByTestId("categoria-sobres").click();
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–12 de 24 productos" })).toBeVisible(); // 8 japoneses + 16 chinos
});

test("inicio: las colecciones (8 japonesas y 4 chinas) enlazan a sus productos y la sección de pago es secundaria", async ({ page }) => {
  await go(page, "/");
  const sec = page.locator("section[aria-labelledby=collections-title]");
  const links = sec.locator("ul a");
  await expect(links).toHaveCount(12);
  const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(12);
  for (const h of hrefs) expect(h).toMatch(/^\/sellados\?expansion=/);
  await links.filter({ hasText: "Storm Emeralda" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–2 de 2 productos" })).toBeVisible();
  await go(page, "/");
  // las promociones ya no se anuncian sin condición: franja visible con el mínimo de una caja
  await expect(page.getByTestId("franja-promos")).toContainText("3 cuotas sin interés o 10% OFF por transferencia");
  await expect(page.getByTestId("franja-promos")).toContainText("compras que incluyan al menos una caja");
  await expect(page.locator("section[aria-labelledby=cat-title]")).not.toContainText("transferencia o efectivo");
});

test("inicio: Cajas y Sobres con colecciones distintas, mismo peso y sin deformar; Packs como franja sin enlace", async ({ page }) => {
  await go(page, "/");
  // las dos categorías muestran colecciones distintas y no se repiten entre sí
  const cols = async (id: string) => (await page.getByTestId(id).locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)))).map((x) => x.match(/products\/([a-z0-9-]+)\//)?.[1]);
  const cajas = await cols("categoria-cajas");
  const sobres = await cols("categoria-sobres");
  expect(cajas.sort()).toEqual(["inferno-x", "mega-dream-ex"]);
  expect(sobres.sort()).toEqual(["black-bolt", "white-flare"]);
  expect(await page.getByTestId("categoria-cajas").locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)))).toEqual(expect.arrayContaining([expect.stringContaining("caja-referencia-2")]));
  expect(await page.getByTestId("categoria-sobres").locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)))).toEqual(expect.arrayContaining([expect.stringContaining("sobre-original")]));
  // mismo peso: las dos tarjetas miden lo mismo
  const [a, b] = await Promise.all(["categoria-cajas", "categoria-sobres"].map((id) => page.getByTestId(id).boundingBox()));
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(2);
  expect(Math.abs(a!.height - b!.height)).toBeLessThan(2);
  const pb = await page.getByTestId("categoria-packs").boundingBox();
  expect(pb!.width).toBeGreaterThan(a!.width + b!.width);
  expect(pb!.y).toBeGreaterThan(a!.y + a!.height);
  // sin deformar ni recortar: las fotos visibles cargaron y usan object-fit: contain
  const medir = () => page.locator("section[aria-labelledby=cat-title] img").evaluateAll((l) => l.map((i) => { const im = i as HTMLImageElement; return { visible: im.getBoundingClientRect().width > 0, cargada: im.naturalWidth > 0, ajuste: getComputedStyle(im).objectFit }; }).filter((f) => f.visible));
  await page.locator("section[aria-labelledby=cat-title] img").last().scrollIntoViewIfNeeded();
  await expect.poll(async () => (await medir()).every((f) => f.cargada)).toBe(true); // las fotos se piden de forma diferida: se espera a que carguen
  const fotos = await medir();
  expect(fotos.length).toBe(7); // 2 cajas + 2 sobres + 3 formatos especiales (kits, cajas especiales, sets de ilustraciones)
  expect(fotos.every((f) => f.cargada && f.ajuste === "contain")).toBe(true);
});

test("inicio: las cartas destacadas se agrandan al enfocarlas y llevan a la galería", async ({ page, isMobile }) => {
  await go(page, "/");
  const lista = page.getByTestId("cartas-destacadas");
  const cartas = lista.getByRole("link");
  await expect(cartas).toHaveCount(3);
  for (const c of await cartas.all()) await expect(c).toHaveAttribute("href", /\/expansiones\/storm-emeralda$/);
  await lista.scrollIntoViewIfNeeded();
  const carta = cartas.nth(1);
  const antes = (await carta.boundingBox())!;
  await carta.focus();
  await expect.poll(async () => (await carta.boundingBox())!.width).toBeGreaterThan(antes.width * 1.2);
  if (!isMobile) {
    await page.mouse.move(0, 0);
    await carta.hover();
    await expect.poll(async () => (await carta.boundingBox())!.width).toBeGreaterThan(antes.width * 1.2);
  }
  await carta.click();
  await expect(page).toHaveURL(/\/expansiones\/storm-emeralda$/);
});
