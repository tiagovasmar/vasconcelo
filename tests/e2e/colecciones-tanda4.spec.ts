import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Catálogo REAL (44 fichas publicadas, todas con precio y stock pendientes). Escritorio y móvil.
const imagenCargada = (page: Page, name: RegExp) => page.getByRole("img", { name }).first().evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 100);

test("inicio: franja de promociones con condición y «Las cartas que querés encontrar» más arriba, una sola vez", async ({ page }) => {
  await go(page, "/");
  const top = (sel: string) => page.locator(sel).evaluate((el) => el.getBoundingClientRect().top + scrollY);
  const formatos = await top("section[aria-labelledby=cat-title]");
  const cartas = await top("section[aria-labelledby=cards-title]");
  const colecciones = await top("section[aria-labelledby=collections-title]");
  expect(formatos).toBeLessThan(cartas);
  expect(cartas).toBeLessThan(colecciones); // antes de las listas largas de colecciones y productos
  await expect(page.locator("#cards-title")).toHaveCount(1);
  await expect(page.getByTestId("cartas-destacadas").locator("li")).toHaveCount(3);
  for (const a of await page.getByTestId("cartas-destacadas").locator("a").all()) await expect(a).toHaveAttribute("href", /\/expansiones\//);
  await expect(page.getByTestId("franja-promos")).toContainText("3 cuotas sin interés o 10% OFF por transferencia · compras que incluyan al menos una caja");
  // la franja queda cerca del inicio: dentro de la primera sección bajo el carrusel, antes de las tarjetas de formatos
  expect(await top("[data-testid=franja-promos]")).toBeLessThan(await top("[data-testid=categoria-cajas]"));
  expect(await top("[data-testid=franja-promos]")).toBeLessThan(cartas);
});

test("nombre principal de las colecciones chinas en inglés (resto del sitio en español), con el nombre original como dato secundario", async ({ page }) => {
  await go(page, "/sellados?idioma=zh");
  const titulos = await page.locator("article h3").allTextContents();
  expect(titulos.length).toBeGreaterThan(5);
  for (const t of titulos) expect(t, t).not.toMatch(/^[㐀-鿿]/);
  await expect(page.locator("article").first().getByTestId("nombre-original")).toBeVisible();
  await go(page, "/productos/zh-taijing-shengju-caja");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terastal Gathering · Caja");
  await expect(page.getByTestId("nombre-original").first()).toContainText("太晶盛聚");
  await expect(page.locator("#descripcion")).toContainText("Nombre principal en inglés «Terastal Gathering»");
  await expect(page.locator("#descripcion")).toContainText("NO un nombre oficial del fabricante");
  await expect(page.locator("#descripcion")).toContainText("Nombre anterior en español: «Gran Reunión Teracristal»");
  // la búsqueda encuentra por nombre en español y por el original
  await go(page, "/sellados?q=teracristal"); // nombre español anterior: sigue funcionando
  await expect(page.locator("article h3")).toHaveCount(3); // Fearless Terastal (sobre), Terastal Gathering (sobre y caja)
  await go(page, "/sellados?q=terastal+gathering");
  await expect(page.locator("article h3")).toHaveCount(2);
  await go(page, "/sellados?q=" + encodeURIComponent("太晶盛聚"));
  await expect(page.locator("article h3")).toHaveCount(2);
  await go(page, "/expansiones/zh-taijing-shengju");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Terastal Gathering");
  await expect(page.getByTestId("nombre-original").first()).toContainText("太晶盛聚");
});

test("太晶盛聚 y 宝石包 VOL.6: foto principal de la caja (1080 px, de la publicación del proveedor) y sin avisos obsoletos", async ({ page }) => {
  await go(page, "/productos/zh-taijing-shengju-caja");
  expect(await imagenCargada(page, /Caja de 太晶盛聚 \(edición china simplificada\) sostenida en la mano/)).toBe(true);
  await go(page, "/productos/zh-baoshibao-vol6-caja");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Gem Pack Vol. 6 · Caja de 18 sobres");
  const main = page.locator("main");
  await expect(main).toContainText("18 sobres de 4 cartas");
  await expect(main).not.toContainText(/盲盒|si la unidad de venta final es la caja o un sobre/);
  expect(await imagenCargada(page, /Los sobres de 宝石包 VOL\.6 que trae la caja/)).toBe(true);
  await go(page, "/productos/zh-30-zhounian-ilustraciones-vol3");
  expect(await imagenCargada(page, /Set de ilustraciones Vol\.3/)).toBe(true);
});

test("encargo desde un producto sin precio ni stock: tarjeta → ficha → carrito → consulta guardada, sin importes ni seña calculada", async ({ page }) => {
  await go(page, "/sellados?q=" + encodeURIComponent("太晶盛聚"));
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Terastal Gathering · Sobre de 10 cartas" }) });
  await card.getByTestId("consultar-encargo").click(); // desde la tarjeta
  await expect(page.getByTestId("cart-count")).toHaveText("1");
  await go(page, "/productos/zh-taijing-shengju-caja");
  await expect(page.getByRole("button", { name: "Agregar al carrito" })).toHaveCount(0);
  await expect(page.getByTestId("pendiente-comercial")).toContainText("una seña del 20%");
  await page.getByRole("button", { name: "Más" }).click();
  await page.getByTestId("pendiente-comercial").getByTestId("consultar-encargo").click();
  await expect(page.getByTestId("cart-count")).toHaveText("3"); // 1 sobre + 2 cajas
  await go(page, "/carrito");
  await expect(page.getByTestId("lineas-encargo").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("lineas-compra")).toHaveCount(0);
  await expect(page.getByTestId("resumen-encargo")).toContainText("cotización a confirmar");
  await expect(page.locator("aside")).not.toContainText(/\$\s?\d/); // ningún importe ni seña inventados
  await expect(page.getByRole("radio", { name: /Transferencia/ })).toBeDisabled();
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByRole("button", { name: "Consultar por encargo por WhatsApp" }).click();
  await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
  const msg = page.getByTestId("mensaje");
  await expect(msg).toContainText("Por encargo (disponibilidad y cotización a confirmar):");
  await expect(msg).toContainText("Terastal Gathering · Sobre de 10 cartas [Chino simplificado]");
  await expect(msg).not.toContainText(/\$|Unitario|Subtotal de productos/);
  await expect(page.getByTestId("nota-encargo")).toContainText("Consultar no reserva mercadería");
});

test("mayoristas: sin desborde horizontal y sin errores de consola", async ({ page }) => {
  const errores: string[] = [];
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  for (const ruta of ["/mayoristas", "/mayoristas/solicitar"]) {
    await go(page, ruta);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), ruta).toBeLessThanOrEqual(0);
  }
  expect(errores).toEqual([]);
});
