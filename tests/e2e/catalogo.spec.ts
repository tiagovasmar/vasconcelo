import { expect, test } from "@playwright/test";
import { go } from "./helpers";

const cards = (page: import("@playwright/test").Page) => page.locator("section[aria-labelledby=archivo-title] ul > li");

test.describe("catálogo", () => {
  test("filtros combinados quedan en la URL y se recuperan al recargar", async ({ page, isMobile }) => {
    await go(page, "/sellados");
    await expect(cards(page)).toHaveCount(8); // 8 productos listables del catálogo de prueba: los 2 protectores (sleeves y top loaders) son solo adicionales y no se listan
    if (isMobile) await page.getByRole("button", { name: /Filtros y orden/ }).click();
    await page.getByLabel("Formato").selectOption("caja");
    await page.getByLabel("Idioma").selectOption("en");
    await page.getByLabel("Ordenar por").selectOption("precio-desc");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/formato=caja/);
    await expect(page).toHaveURL(/idioma=en/);
    await expect(cards(page)).toHaveCount(1);
    const url = page.url();
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(cards(page)).toHaveCount(1);
    expect(new URL(url).search).not.toMatch(/=(&|$)/); // URL limpia, sin parámetros vacíos
    await page.goBack();
    await expect(page).toHaveURL(/\/sellados/);
  });

  test("búsqueda por nombre, expansión y SKU", async ({ page }) => {
    await go(page, "/sellados?q=storm");
    await expect(cards(page)).toHaveCount(3);
    await go(page, "/sellados?q=DEMO-EJ-CAJA");
    await expect(cards(page)).toHaveCount(1);
    await go(page, "/sellados?q=m6");
    await expect(cards(page)).toHaveCount(3);
  });

  test("sin resultados ofrece limpiar filtros", async ({ page }) => {
    await go(page, "/sellados?q=no-existe-xyz");
    await expect(page.getByText("No encontramos productos con esos filtros.")).toBeVisible();
    await page.getByRole("link", { name: /Limpiar filtros/ }).click();
    await expect(cards(page)).toHaveCount(8); // 8 productos listables del catálogo de prueba: los 2 protectores (sleeves y top loaders) son solo adicionales y no se listan
  });

  test("agotado: no permite agregar y mantiene el acceso a la ficha", async ({ page }) => {
    await go(page, "/sellados?q=bundle");
    await expect(page.getByText("Sin stock", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Booster bundle de ejemplo" }).click();
    await expect(page).toHaveURL(/set-parcial-de-ejemplo-bundle/);
    await expect(page.getByRole("button", { name: "Consultar por encargo" })).toBeEnabled();
  });

  test("producto inexistente muestra 404 útil", async ({ page }) => {
    const res = await go(page, "/productos/no-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /No encontramos esa página/ })).toBeVisible();
    const res2 = await go(page, "/expansiones/no-existe");
    expect(res2?.status()).toBe(404);
  });

  test("hoja de filtros móvil: foco, cierre con Escape", async ({ page, isMobile }) => {
    test.skip(!isMobile, "solo móvil");
    await go(page, "/sellados");
    const opener = page.getByRole("button", { name: /Filtros y orden/ });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Filtros" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("ficha de producto", () => {
  test("cambia de imagen, amplía con foco gestionado y cierra con Escape", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Storm Emeralda · Caja/);
    const thumbs = page.getByRole("list", { name: "Miniaturas" }).getByRole("button");
    await thumbs.nth(1).click();
    await expect(thumbs.nth(1)).toHaveAttribute("aria-pressed", "true");
    const zoom = page.getByRole("button", { name: /Ampliar/ });
    await zoom.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(zoom).toBeFocused();
  });

  test("anclas de secciones llevan a su bloque", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    for (const [name, id] of [["Cartas ilustrativas", "cartas"], ["Probabilidades", "probabilidades"], ["Qué garantiza la caja", "contenido"]] as const) {
      await page.getByRole("navigation", { name: "Secciones de la ficha" }).getByRole("link", { name }).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });

  test("datos propios por SKU: la caja muestra 30 sobres y el sobre no", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await expect(page.locator("#descripcion")).toContainText("30 sobres");
    await go(page, "/productos/storm-emeralda-sobre");
    await expect(page.locator("#contenido")).not.toContainText("30 sobres");
  });

  test("probabilidad desconocida: 'Dato no disponible', nunca 0 %", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    const prob = page.locator("#probabilidades");
    await expect(prob).toContainText("Dato no disponible");
    const text = (await prob.innerText()).replace("no equivale a 0 %", "");
    expect(text).not.toMatch(/(^|[^\d,.])0([.,]0+)? ?%/);
  });

  test("garantías: física oficial con fuente; sin garantía de rareza inventada", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    const c = page.locator("#contenido");
    await expect(c).toContainText("30 sobres de 5 cartas por caja");
    await expect(c).toContainText("Fuente oficial");
    await expect(c).toContainText("Sin confirmación documental");
    await expect(page.locator("#contenido a[href*='pokemoncenter-online.com']").first()).toHaveAttribute("href", /pokemoncenter-online\.com/);
  });

  test("garantía sin verificar no aparece como promesa", async ({ page }) => {
    await go(page, "/productos/set-de-ejemplo-caja");
    const c = page.locator("#contenido");
    await expect(c).not.toContainText("Afirmación de ejemplo sin fuente");
    await expect(c).toContainText("no pudimos verificar");
  });

  test("lista de cartas no disponible no se disfraza de lista", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-sobre");
    await expect(page.locator("#cartas")).toContainText("Lista de cartas no disponible todavía");
    await expect(page.locator("#cartas")).toContainText("Ver fuente oficial");
  });
});

test.describe("galería de cartas", () => {
  test("lista completa: buscar, filtrar por rareza, cargar más y ampliar", async ({ page }) => {
    await go(page, "/productos/set-de-ejemplo-sobre");
    const sec = page.locator("#cartas");
    await expect(sec).toContainText("Lista completa");
    await expect(sec).toContainText("26 cartas encontradas de 26 cargadas");
    await expect(sec.locator("ul > li")).toHaveCount(12);
    await sec.getByRole("button", { name: /Ver más cartas/ }).click();
    await expect(sec.locator("ul > li")).toHaveCount(24);
    await sec.getByLabel(/Buscar carta/).fill("007");
    await expect(sec).toContainText("1 carta encontrada");
    await sec.getByLabel(/Buscar carta/).fill("");
    await sec.getByLabel("Rareza").selectOption("Ultra rara");
    await expect(sec.locator("ul > li")).toHaveCount(3);
    const first = sec.locator("ul > li button").first();
    await first.click();
    const dialog = page.getByRole("dialog", { name: "Carta ampliada" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(first).toBeFocused();
    await sec.getByLabel(/Buscar carta/).fill("zzzz");
    await expect(sec).toContainText("Ninguna carta coincide");
  });

  test("lista parcial se rotula como parcial con enlace oficial o aviso", async ({ page }) => {
    await go(page, "/productos/set-parcial-de-ejemplo-sobre");
    await expect(page.locator("#cartas")).toContainText("Galería parcial");
    await expect(page.locator("#cartas")).toContainText("5 cartas cargadas");
  });

  test("pack mixto agrupa cartas por expansión", async ({ page }) => {
    await go(page, "/productos/pack-mixto-de-ejemplo");
    const sec = page.locator("#cartas");
    await expect(sec.getByRole("heading", { name: "Set de ejemplo", exact: true })).toBeVisible();
    await expect(sec.getByRole("heading", { name: "Set parcial de ejemplo" })).toBeVisible();
    await expect(page.locator("#contenido")).toContainText("no hereda las garantías de una caja de fábrica");
  });
});

test.describe("expansiones", () => {
  test("listado derivado de los datos y detalle con productos relacionados", async ({ page }) => {
    await go(page, "/expansiones");
    await expect(page.locator("section[aria-label='Listado de expansiones'] > div > ul > li")).toHaveCount(3);
    await page.getByRole("link", { name: /Storm Emeralda/ }).first().click();
    await expect(page).toHaveURL(/expansiones\/storm-emeralda/);
    await expect(page.getByRole("heading", { level: 2, name: "Productos de esta expansión" })).toBeVisible();
    await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(3);
  });
});

test("teclado: Tab llega a los filtros y a la ficha con foco visible", async ({ page, isMobile }) => {
  test.skip(isMobile, "escritorio");
  await go(page, "/sellados");
  await page.getByLabel("Buscar", { exact: true }).focus();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const visible = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return false;
      return e.matches(":focus-visible");
    });
    expect(visible).toBe(true);
  }
});
