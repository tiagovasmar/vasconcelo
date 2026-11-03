import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Catálogo REAL. Escritorio y móvil: nombres en inglés, sobres de 20 cartas retirados y home integrado.
const KEY = "tienda-carrito-v1";
const RETIRADOS = ["zh-zhenshi-xuanxu-sobre-20", "zh-jiajiang-huihe-sobre-20", "zh-heijing-chicheng-sobre-20", "zh-gengu-kailai-sobre-20", "zh-liren-mengxing-sobre-20", "zh-cuican-guihuan-sobre-20", "zh-qiji-qicheng-sobre-20", "zh-gongzhu-rongguang-sobre-20"];
const seed = async (page: Page, items: Array<Record<string, unknown>>) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items, delivery: { method: "retiro", locality: "", province: "", postalCode: "", pickupPoint: "haedo" }, payment: "efectivo", contactName: "Ana Pérez", idem: null }]);
  await go(page, "/carrito");
};

test("sobres individuales de 20 cartas: sus fichas directas responden «retirado», sin comprar ni encargar y sin indexar", async ({ page }) => {
  for (const slug of RETIRADOS) {
    const res = await go(page, `/productos/${slug}`);
    expect(res?.status(), slug).toBe(200);
    await expect(page.getByTestId("producto-retirado"), slug).toContainText("fue retirado de la tienda");
    await expect(page.getByRole("button", { name: /Agregar|Consultar por encargo/ })).toHaveCount(0);
    await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("link", { name: "Ver el catálogo" })).toHaveAttribute("href", "/sellados");
  }
  // un producto que nunca existió sigue siendo 404
  expect((await page.goto("/productos/no-existe"))?.status()).toBe(404);
});

test("no aparecen en catálogo, búsquedas, filtros ni conteos; los conteos y la paginación se ajustan", async ({ page }) => {
  await go(page, "/sellados");
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–12 de 51 productos" })).toBeVisible();
  for (const q of ["20 cartas", "zhenshi xuanxu", "975082756071-SKU13", "ZH-1008153816247"]) {
    await go(page, `/sellados?q=${encodeURIComponent(q)}`);
    await expect(page.locator("main")).not.toContainText("Sobre de 20 cartas");
  }
  await go(page, "/sellados?idioma=zh&formato=sobre");
  await expect(page.getByRole("status").filter({ hasText: "Mostrando 1–12 de 16 productos" })).toBeVisible();
  await go(page, "/sellados?expansion=zh-gongzhu-rongguang");
  await expect(page.locator("article")).toHaveCount(1);
  // ninguna ficha publicada enlaza a un retirado (relacionados, colecciones)
  await go(page, "/productos/zh-gongzhu-rongguang-sobre-5");
  await expect(page.locator("main a[href*='sobre-20']")).toHaveCount(0);
  const hrefs = await (async () => { await go(page, "/expansiones/zh-gongzhu-rongguang"); return page.locator("main a").evaluateAll((l) => l.map((a) => a.getAttribute("href"))); })();
  expect(hrefs.filter((h) => h?.includes("sobre-20"))).toEqual([]);
});

test("la colección que quedó sin productos publicados deja de listarse (su enlace directo no rompe)", async ({ page }) => {
  await go(page, "/expansiones");
  await expect(page.getByTestId("grupo-zh").locator("li")).toHaveCount(17);
  await expect(page.getByTestId("grupo-zh")).not.toContainText("Miracle Journey");
  await go(page, "/");
  await expect(page.locator("a[href*='zh-qiji-qicheng']")).toHaveCount(0);
  const res = await go(page, "/expansiones/zh-qiji-qicheng");
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Miracle Journey");
});

test("carrito antiguo con sobres de 20 cartas: se informa que fueron retirados, no se puede continuar y quitarlos habilita el resto", async ({ page }) => {
  await seed(page, [
    { productId: "zh-zhenshi-xuanxu-sobre-20", quantity: 1, priceMinor: 0, mode: "buy" },
    { productId: "zh-jiajiang-huihe-sobre-20", quantity: 2, priceMinor: 0, mode: "encargo" },
    { productId: "zh-taijing-shengju-sobre-10", quantity: 1, priceMinor: 0, mode: "encargo" },
  ]);
  const avisos = page.getByTestId("aviso-retirado");
  await expect(avisos).toHaveCount(2);
  await expect(avisos.first()).toContainText("fue retirado de la tienda");
  await expect(avisos.first()).toContainText("Ya no se puede comprar ni consultar por encargo");
  await expect(page.getByRole("button", { name: /Consultar por encargo$/ })).toHaveCount(0); // no se ofrece pasarlo a encargo
  await expect(page.getByRole("button", { name: /Continuar por WhatsApp|Consultar por encargo por WhatsApp/ })).toBeDisabled();
  await page.getByRole("button", { name: /Quitar Arcane Truth · Sobre de 20 cartas del carrito/ }).click();
  await page.getByRole("button", { name: /Quitar Reward Round · Sobre de 20 cartas del carrito/ }).click();
  await expect(avisos).toHaveCount(0);
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await expect(page.getByRole("button", { name: "Consultar por encargo por WhatsApp" })).toBeEnabled();
});

test("servidor: un retirado no entra en una consulta nueva (compra ni encargo) y la validación lo informa", async ({ page, request }) => {
  await go(page, "/");
  const v = await (await request.post("/api/cart/validate", { data: { items: [{ productId: "zh-cuican-guihuan-sobre-20", quantity: 1 }, { productId: "zh-cuican-guihuan-sobre-20x", quantity: 1 }] } })).json();
  expect(v.lines[0]).toMatchObject({ status: "retired", unitPriceMinor: null });
  expect(v.lines[1].status).toBe("unavailable");
  for (const mode of ["buy", "encargo"]) {
    const res = await request.post("/api/inquiries", { data: { items: [{ productId: "zh-cuican-guihuan-sobre-20", quantity: 1, mode }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: `retirado-${mode}-${Date.now()}-${Math.random().toString(36).slice(2)}` } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.message).toContain("retirados");
  }
});

test("lo que NO se retira sigue publicado: kits con sobres de 20 cartas, cajas japonesas con 20 sobres, sobres de 5, 6, 7 y 10", async ({ page }) => {
  for (const [slug, titulo] of [["zh-kit-mengleigu-ex", /Raging Bolt ex/], ["zh-kit-saifuhao-ex", /Gholdengo ex/], ["zh-caja-ogerpon-agua", /Wellspring Mask/], ["white-flare-caja", /White Flare/], ["black-bolt-caja", /Black Bolt/], ["zh-taijing-shengju-sobre-10", /Terastal Gathering/], ["zh-shengxiang-xingyin-sobre-6", /Victory Star Guide/], ["black-bolt-sobre", /Black Bolt/]] as const) {
    await go(page, `/productos/${slug}`);
    await expect(page.getByRole("heading", { level: 1 }), slug).toContainText(titulo);
    await expect(page.getByTestId("producto-retirado"), slug).toHaveCount(0);
  }
});

test("nombres principales en inglés en filtros, colecciones y tarjetas; alias del nombre anterior y de variantes encuentran el producto", async ({ page }) => {
  await go(page, "/sellados");
  const exps = await page.getByLabel("Expansión").locator("option").allInnerTexts();
  for (const n of ["Terastal Gathering", "Stellar Crystal", "Brilliant Illusions", "Chasing Glory Together", "Gem Pack Vol. 6", "30th Celebration", "Victory Star Guide"]) expect(exps, n).toContain(n);
  expect(exps.filter((t) => /[㐀-鿿]/.test(t)), "ninguna opción del filtro es solo chino").toEqual([]);
  for (const [q, esperado] of [["Sparkling Fantasy", "Brilliant Illusions"], ["Ilusión Resplandeciente", "Brilliant Illusions"], ["璀璨诡幻", "Brilliant Illusions"], ["cuican guihuan", "Brilliant Illusions"], ["Cristal de Colores Estelares", "Stellar Crystal"], ["Bonus Round", "Reward Round"]] as const) {
    await go(page, `/sellados?q=${encodeURIComponent(q)}`);
    await expect(page.locator("article h3").first(), q).toContainText(esperado);
  }
  // una colección china y una japonesa con el mismo nombre comercial no se mezclan
  await go(page, "/sellados?expansion=zh-30-zhounian");
  for (const a of await page.locator("article").all()) await expect(a).toContainText("Chino simplificado");
  await go(page, "/expansiones/zh-30-zhounian");
  await expect(page.locator("main")).toContainText("Lista no disponible aún");
});

test("ficha china: nombre inglés rotulado como no oficial, variantes, nombre anterior en español y fuentes de los nombres", async ({ page }) => {
  await go(page, "/productos/zh-cuican-guihuan-sobre-5");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brilliant Illusions · Sobre de 5 cartas");
  const d = page.locator("#descripcion");
  await expect(d).toContainText("NO un nombre oficial del fabricante");
  await expect(d).toContainText("Las fuentes no coinciden del todo en el nombre");
  await expect(d).toContainText("Brilliant Fantasy; Sparkling Fantasy");
  await expect(d).toContainText("Nombre anterior en español: «Ilusión Resplandeciente»");
  await page.getByTestId("fuentes-detalle").locator("summary").click();
  await expect(page.getByTestId("fuentes-detalle")).toContainText("KrystalKollectz");
  await go(page, "/productos/zh-30-zhounian-sobre-6");
  await expect(page.locator("#descripcion")).toContainText("es el nombre oficial impreso en el envase");
});

test("inicio: sin sección china independiente, colecciones integradas y sin desborde ni imágenes rotas", async ({ page }) => {
  await go(page, "/");
  await expect(page.locator("main")).not.toContainText(/También en chino simplificado|Ediciones chinas/);
  const sec = page.locator("section[aria-labelledby=collections-title]");
  await expect(sec.locator("li").filter({ hasText: "Terastal Gathering" }).getByText("Chino simplificado")).toBeVisible();
  for (const img of await sec.locator("img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
