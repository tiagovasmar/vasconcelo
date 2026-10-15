import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL: ediciones en chino simplificado (28 fichas publicadas, 8 retiradas) y la marca Vasconcelo. Escritorio y móvil.
const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

test("la marca pública es Vasconcelo (cabecera, pie, título y nombre accesible)", async ({ page }) => {
  await go(page, "/");
  await expect(page).toHaveTitle(/^Vasconcelo · POKÉMON TCG$/);
  await expect(page.getByRole("banner").getByRole("link", { name: "Vasconcelo, inicio" })).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("Vasconcelo");
  expect(await page.locator("body").innerText()).not.toMatch(/TU TIENDA/i);
  await go(page, "/sellados");
  await expect(page).toHaveTitle(/Todos los sellados · Vasconcelo/);
});

test("inicio: sin sección exclusiva de chino simplificado; colecciones integradas con su nombre en inglés y su idioma, y formatos especiales", async ({ page }) => {
  await go(page, "/");
  // el bloque independiente «Ediciones chinas» ya no existe ni deja textos promocionales propios
  await expect(page.getByTestId("ediciones-chinas")).toHaveCount(0);
  await expect(page.locator("#zh-title")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/También en chino simplificado|Ediciones chinas|colecciones chinas más|fichas chinas/);
  // las colecciones japonesas y una selección de las chinas conviven en el mismo listado (8 + 4), cada una con su idioma a la vista
  const sec = page.locator("section[aria-labelledby=collections-title]");
  await expect(sec.getByRole("heading", { level: 2 })).toHaveText("Elegí tu colección.");
  await expect(sec.locator("ul > li")).toHaveCount(12);
  await expect(sec.locator("ul > li").filter({ hasText: "Chino simplificado" })).toHaveCount(4);
  await expect(sec.locator("ul > li").filter({ hasText: "Japonés" })).toHaveCount(8);
  for (const nombre of ["Terastal Gathering", "Stellar Crystal", "Brilliant Illusions", "30th Celebration"]) await expect(sec.getByRole("heading", { level: 3, name: nombre, exact: true })).toBeVisible();
  await sec.getByRole("link", { name: /Terastal Gathering/ }).click();
  await expect(page).toHaveURL(/expansion=zh-taijing-shengju/);
  await go(page, "/");
  const esp = page.getByTestId("formatos-especiales");
  await expect(esp.locator("li")).toHaveCount(3);
  await expect(page.getByTestId("formato-kit")).toHaveAttribute("href", "/sellados?formato=kit");
  await expect(page.getByTestId("formato-especial")).toHaveAttribute("href", "/sellados?formato=especial");
  await expect(page.getByTestId("formato-ilustraciones")).toHaveAttribute("href", "/sellados?formato=ilustraciones");
  await page.getByTestId("formato-kit").click();
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–3 de 3 productos" })).toBeVisible();
  await sinDesborde(page);
});

test("el home y el catálogo chino no tienen imágenes rotas ni desbordes", async ({ page }) => {
  for (const url of ["/", "/sellados?idioma=zh", "/sellados?idioma=zh&pagina=2", "/sellados?idioma=zh&pagina=3", "/expansiones"]) {
    await go(page, url);
    for (const img of await page.locator("main img").all()) {
      if (!(await img.isVisible())) continue;
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: `${url}: ${await img.getAttribute("alt")}` }).toBe(true);
    }
    await sinDesborde(page);
  }
});

test("catálogo: filtros por idioma, formato y colección; búsqueda por nombre chino y por romanización", async ({ page, isMobile }) => {
  const resumen = (t: string) => expect(page.getByRole("status").filter({ hasText: t })).toBeVisible();
  await go(page, "/sellados?idioma=zh");
  await resumen("Mostrando 1–12 de 28 productos");
  await go(page, "/sellados?formato=especial");
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?formato=ilustraciones");
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?expansion=zh-taijing-shengju");
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?q=太晶盛聚");
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?q=taijing"); // también encuentra «无畏太晶» (taijing = 太晶)
  await resumen("Mostrando 1–3 de 3 productos");
  await go(page, "/sellados?q=" + encodeURIComponent("Gran Reunión Teracristal")); // nombre español anterior
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?q=terastal+gathering");
  await resumen("Mostrando 1–2 de 2 productos");
  await go(page, "/sellados?idioma=zh&pagina=3");
  await resumen("Mostrando 25–28 de 28 productos");
  await expect(page.getByRole("link", { name: "Siguiente →" })).toHaveCount(0);
  // formulario: se elige el formato nuevo desde el desplegable
  await go(page, "/sellados");
  if (isMobile) await page.getByRole("button", { name: /Filtros y orden/ }).click();
  await page.getByLabel("Formato").selectOption("kit");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await expect(page).toHaveURL(/formato=kit/);
  await resumen("Mostrando 1–3 de 3 productos");
});

test("ficha china: sobres de 5 y de 20 cartas distinguibles, idioma escrito, precio pendiente y compra deshabilitada", async ({ page }) => {
  const datos: Array<[string, string, string]> = [["zh-gongzhu-rongguang-sobre-5", "Chasing Glory Together · Sobre de 5 cartas", "5 cartas"], ["zh-taijing-shengju-sobre-10", "Terastal Gathering · Sobre de 10 cartas", "10 cartas"]];
  for (const [slug, titulo, variante] of datos) {
    await go(page, `/productos/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(titulo);
    await expect(page.getByTestId("etiquetas").first().getByTestId("etiqueta-idioma")).toHaveText("Chino simplificado");
    await expect(page.getByTestId("etiquetas").first().getByTestId("etiqueta-coleccion")).toContainText(titulo.split(" · ")[0]);
    await expect(page.getByTestId("nombre-original").first()).toContainText(/共逐荣光|太晶盛聚/); // el nombre chino queda como dato secundario
    await expect(page.locator("p.eyebrow").first()).toContainText(variante);
    await expect(page.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await expect(page.getByTestId("disponibilidad").first()).toHaveText("Sin stock");
    // sin precio ni stock: no se compra, se puede consultar por encargo
    await expect(page.getByTestId("pendiente-comercial").getByRole("button", { name: "Consultar por encargo" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Agregar al carrito" })).toHaveCount(0);
    await expect(page.locator("#descripcion")).toContainText("en chino simplificado");
    await expect(page.locator("#descripcion")).not.toContainText(/edición japonesa/i);
    await expect(page.locator("main")).not.toContainText(/\$\s?0\b|Deluxe/);
    // foto de proveedor, rotulada como tal, sin afirmar que sea del fabricante ni del stock
    await expect(page.getByTestId("galeria-etiqueta")).toContainText("Foto de referencia del proveedor");
    await expect(page.getByTestId("galeria-etiqueta")).toContainText("ni es del stock de la tienda");
    const img = page.getByRole("img", { name: /Sobre de \d+ cartas de (共逐荣光|太晶盛聚)/ }).first();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 100)).toBe(true);
    // sin lista de cartas cargada: se dice con todas las letras (no se muestra una galería vacía ni la de otra edición)
    await expect(page.locator("#cartas")).toContainText("Lista de cartas no disponible todavía");
    await expect(page.locator("#cartas")).toContainText("No se reutiliza la lista de una expansión japonesa");
    await expect(page.locator("#cartas")).not.toContainText("fuente oficial");
    await expect(page.locator("#cartas img")).toHaveCount(0);
    await expect(page.locator("#probabilidades")).toContainText("Dato no disponible");
  }
});

test("ficha china: kit de mazo con contenido detallado y gráfico del proveedor rotulado", async ({ page }) => {
  await go(page, "/productos/zh-kit-mengleigu-ex");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Master Strategy Deck Building Set: Raging Bolt ex");
  await expect(page.getByTestId("nombre-original").first()).toContainText("猛雷鼓ex");
  await expect(page.locator("p.eyebrow").first()).toContainText("Kit de mazo");
  await expect(page.getByTestId("etiquetas").first().getByTestId("etiqueta-coleccion")).toHaveCount(0);
  await expect(page.locator("#cartas")).toHaveCount(0); // sin colección no hay sección de cartas de la expansión
  await expect(page.locator("#contenido")).toContainText("Mazo 猛雷鼓ex (60 cartas)");
  await expect(page.locator("#contenido")).toContainText("4 sobres · Sobres de 共逐荣光 (20 cartas cada uno)");
  const thumbs = page.getByRole("list", { name: "Miniaturas" }).getByRole("button");
  await expect(thumbs).toHaveCount(2);
  await thumbs.nth(1).click();
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("Contenido físico");
  await expect(page.getByRole("img", { name: /según el gráfico del proveedor/ }).first()).toBeVisible();
  // no se confunde con el otro kit
  await go(page, "/productos/zh-kit-saifuhao-ex");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Gholdengo ex");
});

test("ficha china: sets Vol.2 y Vol.3 distintos, y el 30th chino no pisa al japonés", async ({ page }) => {
  await go(page, "/productos/zh-30-zhounian-ilustraciones-vol2");
  await expect(page.locator("p.eyebrow").first()).toContainText("Set de ilustraciones · Vol.2");
  await expect(page.locator("#contenido")).toContainText("星彩晶璃");
  await go(page, "/productos/zh-30-zhounian-ilustraciones-vol3");
  await expect(page.locator("p.eyebrow").first()).toContainText("Set de ilustraciones · Vol.3");
  await expect(page.locator("#contenido")).toContainText("共逐荣光");
  await go(page, "/expansiones/30th-celebration");
  await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(2); // solo caja y sobre japoneses
  await expect(page.locator("main")).not.toContainText("30周年庆典");
  await go(page, "/expansiones/zh-30-zhounian");
  await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(4);
});

test("colección china: página propia sin banner japonés, sin lista de cartas inventada y con sus fuentes", async ({ page }) => {
  await go(page, "/expansiones/zh-gongzhu-rongguang");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Chasing Glory Together");
  await expect(page.getByTestId("nombre-original").first()).toContainText("共逐荣光");
  await expect(page.locator("main")).toContainText("Lista no disponible aún");
  await expect(page.locator("main")).toContainText("No se reutiliza la lista de una expansión japonesa");
  await expect(page.locator("main")).not.toContainText(/Edición japonesa|undefined/);
  await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(1); // el sobre de 20 cartas fue retirado
  await expect(page.locator("main a", { hasText: "fuente oficial" })).toHaveCount(0); // no se llama «oficial» a la publicación de un proveedor
  await expect(page.locator("#exp-fuentes ~ ul a").first()).toHaveAttribute("href", /^https:\/\/detail\.tmall\.com\/item\.htm\?id=/);
  await go(page, "/expansiones");
  await expect(page.getByTestId("grupo-zh").locator("li")).toHaveCount(17); // la colección sin productos publicados no se lista
  await sinDesborde(page);
});

test("el servidor no deja consultar una ficha china sin precio ni stock", async ({ request }) => {
  const v = await (await request.post("/api/cart/validate", { data: { items: [{ productId: "zh-kit-haipi-zuhe", quantity: 1, expectedPriceMinor: 1000000 }] } })).json();
  expect(v.lines[0]).toMatchObject({ status: "pending_commercial", unitPriceMinor: null, maxQuantity: 0 });
});
