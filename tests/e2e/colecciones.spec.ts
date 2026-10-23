import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL: 8 colecciones japonesas (16 fichas) + 18 colecciones chinas (36 fichas), precio y stock pendientes.
const KEY = "tienda-carrito-v1";
const cards = (page: Page) => page.locator("section[aria-labelledby=archivo-title] ul > li");

test.describe("catálogo y destacados", () => {
  test("el catálogo muestra las 50 fichas reales publicadas (22 japonesas + 28 chinas), con «Precio a confirmar» y sin datos de demostración", async ({ page }) => {
    await go(page, "/sellados");
    await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–12 de 50 productos" })).toBeVisible();
    await expect(cards(page)).toHaveCount(12);
    await expect(page.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await expect(page.getByTestId("disponibilidad").first()).toHaveText("Sin stock");
    const body = await page.locator("main").innerText();
    expect(body).not.toMatch(/\$\s?0\b|de ejemplo|DEMO|Agotado/i); // ni $0, ni demo, ni «agotado» falso
    await page.getByRole("link", { name: "Siguiente →" }).click();
    await expect(cards(page)).toHaveCount(12);
    await go(page, "/sellados?pagina=5"); // última página: 50 = 4 × 12 + 2 (los 2 protectores son solo adicionales y no se listan)
    await expect(cards(page)).toHaveCount(2);
    await expect(page.locator("main")).not.toContainText(/sleeves|top loaders/i);
    // ningún botón de agregar está activo: cada tarjeta explica por qué
    await expect(page.getByTestId("consultar-encargo")).toHaveCount(2); // sin precio ni stock (los 2 chinos de la última página): no se compra, se consulta por encargo
    await expect(page.getByRole("button", { name: /^Agregar .* al carrito$/ })).toHaveCount(0);
  });

  test("filtros: idioma, expansión y formato; buscar por nombre o código", async ({ page }) => {
    await go(page, "/sellados");
    const idiomas = await page.getByLabel("Idioma").locator("option").allInnerTexts();
    expect(idiomas).toEqual(["Todos", "Japonés", "Chino simplificado"]); // no se ofrecen idiomas sin productos
    const exps = await page.getByLabel("Expansión").locator("option").allInnerTexts();
    expect(exps).toHaveLength(32); // «Todas» + 8 + 6 japonesas + 17 chinas (la colección sin productos publicados no se ofrece)
    const formatos = await page.getByLabel("Formato").locator("option").allInnerTexts();
    expect(formatos).toEqual(expect.arrayContaining(["Kits de mazo", "Cajas especiales", "Sets de ilustraciones"]));
    await go(page, "/sellados?expansion=abyss-eye");
    await expect(cards(page)).toHaveCount(2);
    await go(page, "/sellados?formato=caja");
    await expect(page.getByText(/de 18 productos/)).toBeVisible(); // 14 japonesas + 4 chinas
    await go(page, "/sellados?idioma=ja&formato=caja");
    await expect(page.getByText(/de 14 productos/)).toBeVisible();
    await go(page, "/sellados?idioma=en");
    await expect(page.getByText("No encontramos productos con esos filtros.")).toBeVisible();
    await go(page, "/sellados?q=M6-JP");
    await expect(cards(page)).toHaveCount(2);
    // un rango de precio no deja pasar productos con precio pendiente
    await go(page, "/sellados?pmin=5000"); // los accesorios cuestan menos que eso
    await expect(page.getByText("No encontramos productos con esos filtros.")).toBeVisible();
  });

  test("los destacados del inicio son productos reales y enlazan a su ficha", async ({ page }) => {
    await go(page, "/");
    const feat = page.locator("section[aria-labelledby=feat-title]");
    await expect(feat.locator("article")).toHaveCount(4);
    await expect(feat).toContainText("Storm Emeralda");
    await expect(feat).not.toContainText(/ejemplo|Pack de 5 sobres|Booster bundle/);
    await expect(feat.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await feat.getByRole("link", { name: "Storm Emeralda · Caja de 30 sobres" }).first().click();
    await expect(page).toHaveURL(/\/productos\/storm-emeralda-caja$/);
  });

  test("las colecciones se listan por idioma (14 japonesas, 17 chinas con productos publicados) con su sobre real y enlazan a su detalle", async ({ page }) => {
    await go(page, "/expansiones");
    await expect(page.getByTestId("grupo-ja").locator("li")).toHaveCount(14);
    await expect(page.getByTestId("grupo-zh").locator("li")).toHaveCount(17);
    await expect(page.locator("section[aria-label='Listado de expansiones'] img").first()).toBeVisible();
    await page.getByRole("link", { name: /Black Bolt/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Black Bolt/);
    await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(2); // caja y sobre, por separado
  });

  test("las URLs de los productos de demostración redirigen al catálogo y Storm Emeralda conserva las suyas", async ({ page }) => {
    await page.goto("/productos/storm-emeralda-pack-5-sobres");
    await expect(page).toHaveURL(/\/sellados$/);
    await page.goto("/expansiones/set-de-ejemplo");
    await expect(page).toHaveURL(/\/expansiones$/);
    expect((await page.goto("/expansiones/storm-emeralda"))?.status()).toBe(200);
    expect((await page.goto("/productos/storm-emeralda-sobre"))?.status()).toBe(200);
  });
});

test.describe("ficha: caja y sobre", () => {
  test("caja de Storm Emeralda: imágenes reales (cerrada primero), precio pendiente y compra deshabilitada", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Storm Emeralda · Caja de 30 sobres");
    await expect(page.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await expect(page.getByTestId("disponibilidad").first()).toHaveText("Sin stock");
    await expect(page.getByTestId("pendiente-comercial")).toContainText("Sin stock disponible");
    await expect(page.getByTestId("pendiente-comercial").getByRole("button", { name: "Consultar por encargo" })).toBeEnabled();
    await expect(page.locator("main")).not.toContainText(/\$\s?0\b/);

    // la imagen principal es la caja CERRADA (archivo real, no la ilustración de reserva)
    const principal = page.getByRole("img", { name: /Caja cerrada de Storm Emeralda/ }).first();
    await expect(principal).toBeVisible();
    expect(await principal.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 100)).toBe(true);
    expect(await principal.getAttribute("src")).toContain("caja-referencia-2-original");
    // miniaturas: la segunda es la exhibición abierta, aclarada como no representativa del artículo vendido
    const thumbs = page.getByRole("list", { name: "Miniaturas" }).getByRole("button");
    await expect(thumbs).toHaveCount(2);
    await thumbs.nth(1).click();
    await expect(thumbs.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("img", { name: /abierta: presentación de exhibición del fabricante \(no es el estado del artículo que se vende\)/ }).first()).toBeVisible();
    // zoom accesible
    const zoom = page.getByRole("button", { name: "Ampliar", exact: true });
    await zoom.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(zoom).toBeFocused();
  });

  test("sobre individual: una sola imagen y contenido propio (no el de la caja)", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-sobre");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Storm Emeralda · Sobre individual");
    await expect(page.getByRole("list", { name: "Miniaturas" })).toHaveCount(0);
    const img = page.getByRole("img", { name: /Sobre individual de Storm Emeralda/ }).first();
    expect(await img.getAttribute("src")).toContain("sobre-original");
    await expect(page.locator("#descripcion")).toContainText("5 cartas al azar");
    await expect(page.locator("#descripcion")).not.toContainText("30 sobres");
    await expect(page.locator("#contenido")).not.toContainText("30 sobres");
  });

  test("garantías: contenido físico con fuente; sin garantías de rareza; probabilidades «no disponibles»", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    const c = page.locator("#contenido");
    await expect(c).toContainText("30 sobres por caja, de 5 cartas cada uno (150 posiciones de carta)");
    await expect(c).toContainText("Qué garantiza esta caja");
    await expect(c).toContainText("Sin confirmación documental");
    await expect(c).not.toContainText(/SAR|AR garantizada|Deluxe/);
    await expect(page.locator("a[href='https://www.pokemoncenter-online.com/9900000008109.html']").first()).toHaveAttribute("href", "https://www.pokemoncenter-online.com/9900000008109.html");
    const prob = page.locator("#probabilidades");
    await expect(prob).toContainText("Dato no disponible");
    await expect(prob).toContainText("no es la probabilidad de cada carta");
    expect((await prob.innerText()).replace("no equivale a 0 %", "")).not.toMatch(/(^|[^\d,.])0([.,]0+)? ?%/);
  });

  test("Black Bolt (estándar): 2 cartas brillantes por sobre, sin la AR garantizada del Deluxe", async ({ page }) => {
    for (const slug of ["black-bolt-sobre", "black-bolt-caja"]) {
      await go(page, `/productos/${slug}`);
      const c = page.locator("#contenido");
      await expect(c).toContainText("2 cartas con acabado brillante");
      await expect(c).toContainText("必ず2枚キラカード");
      await expect(c).not.toContainText(/AR garantizad|garantiza[n]? \d+ AR|Deluxe/); // la ficha aclara que dos brillantes NO equivalen a dos AR
      if (slug.endsWith("caja")) await expect(c).toContainText("dos cartas brillantes no equivalen a dos AR");
      await expect(page.locator("main")).not.toContainText(/Deluxe/);
    }
  });

  test("MEGA Dream ex: 1 carta ex o Mega ex por sobre, sin nombrar una carta concreta ni una SAR", async ({ page }) => {
    await go(page, "/productos/mega-dream-ex-sobre");
    const c = page.locator("#contenido");
    await expect(c).toContainText("1 carta Pokémon ex o Mega Evolution ex");
    await expect(c).toContainText("No es una carta concreta ni una SAR");
    await expect(c).toContainText("Fuente oficial");
  });

  test("30th CELEBRATION: Pikachu del aniversario y Energía básica por sobre, y acabado brillante", async ({ page }) => {
    await go(page, "/productos/30th-celebration-caja");
    const c = page.locator("#contenido");
    await expect(c).toContainText("1 carta especial de Pikachu del 30.º aniversario");
    await expect(c).toContainText("1 carta de Energía básica");
    await expect(c).toContainText("No garantiza una ilustración concreta de Pikachu");
    await expect(c).toContainText("acabado brillante");
    await expect(c).not.toContainText(/sorteo|concurso|regalo/i);
  });

  test("Heat Wave Arena: la promo de compra de Pokémon Center no es contenido de la caja", async ({ page }) => {
    await go(page, "/productos/heat-wave-arena-caja");
    await expect(page.locator("main")).not.toContainText(/concurso|regalo|イラストレーション|obsequio/i);
    await expect(page.locator("#contenido")).not.toContainText(/promo/i); // la promo de compra no es contenido de la caja
    await expect(page.locator("#contenido")).toContainText("30 sobres por caja, de 5 cartas cada uno");
  });
});

test.describe("galerías de cartas", () => {
  test("lista completa (Black Bolt): 174 cartas verificadas, números sin huecos, buscador y rareza", async ({ page }) => {
    await go(page, "/productos/black-bolt-caja");
    const sec = page.locator("#cartas");
    await expect(sec).toContainText("Lista completa: 174 cartas cargadas");
    await expect(sec).toContainText("de 001 a 174 sin huecos");
    await expect(sec).toContainText("174 cartas encontradas de 174 cargadas");
    await expect(sec.locator("ul > li")).toHaveCount(12); // carga progresiva
    // las imágenes de cartas son archivos reales
    await sec.locator("ul > li").first().scrollIntoViewIfNeeded(); // la grilla pide sus imágenes al acercarse (carga por proximidad)
    const primera = sec.locator("ul > li img").first();
    await expect(primera).toBeVisible();
    await expect.poll(() => primera.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 100)).toBe(true);
    await sec.getByLabel(/Buscar carta/).fill("174");
    await expect(sec).toContainText("1 carta encontrada");
    await sec.getByLabel(/Buscar carta/).fill("");
    const rarezas = await sec.getByLabel("Rareza").locator("option").allInnerTexts();
    expect(rarezas).toEqual(expect.arrayContaining(["Todas", "AR", "SAR", "SR", "C", "U"]));
    await sec.getByLabel("Rareza").selectOption("SAR");
    await expect(sec.locator("ul > li").first()).toContainText("SAR");
    await sec.locator("ul > li button").first().click();
    await expect(page.getByRole("dialog", { name: "Carta ampliada" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Carta ampliada" })).toBeHidden();
  });

  test("galería parcial (Storm Emeralda): se dice exactamente qué números faltan", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-sobre");
    const sec = page.locator("#cartas");
    await expect(sec).toContainText("Galería parcial");
    await expect(sec).toContainText("110 cartas cargadas");
    await expect(sec).toContainText("Faltan en esa lista los números 71, 73 y 75");
    await expect(sec).toContainText("Ver fuente oficial");
    await expect(sec).not.toContainText("Lista completa");
  });

  test("galería parcial (30th CELEBRATION): faltan 104–135 y 151; rareza solo donde la fuente la muestra", async ({ page }) => {
    await go(page, "/expansiones/30th-celebration");
    const sec = page.locator("#exp-cartas ~ div, section[aria-labelledby=exp-cartas]").first();
    await expect(page.locator("main")).toContainText("Galería parcial");
    await expect(page.locator("main")).toContainText("Faltan en esa lista los números 104–135 y 151");
    await expect(page.locator("main")).toContainText("140 cartas cargadas");
    await expect(sec).toBeVisible();
  });

  test("el detalle de la expansión comparte galería y muestra sus productos", async ({ page }) => {
    await go(page, "/expansiones/mega-dream-ex");
    await expect(page.locator("main")).toContainText("Lista completa: 250 cartas cargadas");
    await expect(page.locator("#exp-prods ~ ul > li")).toHaveCount(2);
    await expect(page.locator("main")).toContainText("Nombre original: MEGAドリームex");
  });
});

test.describe("precio pendiente: el servidor nunca lo acepta", () => {
  test("validar carrito e iniciar una consulta con un SKU pendiente falla, aunque se manipule la petición", async ({ request }) => {
    const v = await (await request.post("/api/cart/validate", { data: { items: [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1850000 }] } })).json();
    expect(v.lines[0]).toMatchObject({ status: "pending_commercial", unitPriceMinor: null, maxQuantity: 0 });
    const body = { items: [{ productId: "storm-caja", quantity: 2, expectedPriceMinor: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: `pendiente-${Date.now()}-${Math.random().toString(36).slice(2)}`, acceptPriceChanges: true, priceMinor: 100, total: 100 };
    await request.get("/carrito");
    const res = await request.post("/api/inquiries", { data: body });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("pending_commercial");
  });

  test("un carrito guardado con un producto pendiente se bloquea con un aviso y no ofrece continuar", async ({ page }) => {
    await go(page, "/");
    await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items: [{ productId: "abyss-eye-caja", quantity: 1, priceMinor: 1 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "efectivo", contactName: "Ana Pérez", idem: null }]);
    await go(page, "/carrito");
    await expect(page.getByTestId("aviso-pendiente")).toContainText("Todavía no se puede comprar");
    await expect(page.getByRole("button", { name: "Continuar por WhatsApp" })).toBeDisabled();
    await expect(page.getByTestId("resumen-subtotal")).toContainText("0"); // subtotal de productos sin importes, no un total
    await expect(page.locator("main")).toContainText("Precio a confirmar");
    await page.getByRole("button", { name: /Quitar Abyss Eye/ }).click();
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
  });
});

test.describe("accesibilidad y responsive del lote", () => {
  const pages: Array<[string, string]> = [
    ["inicio", "/"],
    ["catálogo", "/sellados"],
    ["ficha de caja (galería parcial)", "/productos/storm-emeralda-caja"],
    ["ficha de sobre (lista completa)", "/productos/white-flare-sobre"],
    ["ficha con composición", "/productos/30th-celebration-sobre"],
    ["expansión", "/expansiones/inferno-x"],
    ["expansiones", "/expansiones"],
    ["ficha china: sobre de 5 cartas", "/productos/zh-gongzhu-rongguang-sobre-5"],
    ["ficha china: kit de mazo", "/productos/zh-kit-saifuhao-ex"],
    ["ficha china: caja especial", "/productos/zh-caja-ogerpon-agua"],
    ["catálogo filtrado por idioma chino", "/sellados?idioma=zh"],
    ["colección china", "/expansiones/zh-gongzhu-rongguang"],
    ["ficha de caja sin stock (widget de encargo)", "/productos/abyss-eye-caja"],
    ["ficha de caja con foto de proveedor", "/productos/pokemon-card-151-caja"],
    ["ficha de caja con fotos de Pokémon Center", "/productos/ninja-spinner-caja"],
  ];
  for (const [name, url] of pages) {
    test(`axe y sin desborde: ${name}`, async ({ page }) => {
      await go(page, url);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.map((v) => `${v.id} → ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
});
