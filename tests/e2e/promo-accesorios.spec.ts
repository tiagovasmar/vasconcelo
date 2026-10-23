import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { expect, test as base, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor «consultas» (:3104, catálogo de prueba, ADMIN_EMAIL=dueno-e2e@example.com, base propia). Promoción caja + sobres, accesorios con precio fijo en pesos y
// recomendaciones del carrito lateral. Se usan productos que admin-consultas.spec.ts no toca: storm-caja, storm-sobre, parcial-sobre y los dos accesorios.
// Las consultas se crean ANTES de la primera venta: en el catálogo de prueba, guardar stock de un producto fija su precio ARS como «pendiente».
const stamp = process.env.E2E_STAMP!;
const BASE = "http://localhost:3104";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const mailDir = path.resolve(`.local/data/e2e-${stamp}-consultas-mail`);
const KEY = "tienda-carrito-v1";
const SLEEVES = "sleeves-transparentes-pack-5";
const TOP = "top-loaders-transparentes-pack-5";

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});
test.describe.configure({ mode: "serial" });

async function verificationLink(to: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(mailDir) ? fs.readdirSync(mailDir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mailDir, f), "utf8")) as { to: string; kind: string; link: string }).filter((m) => m.to === to && m.kind === "verificacion") : [];
    if (found.length) return found[found.length - 1].link;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo de confirmación para ${to}`);
}
async function ownerSession(page: Page) {
  const signIn = () => page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: OWNER, password: PASSWORD }, headers: { Origin: BASE } });
  if ((await signIn()).ok()) return;
  const up = await page.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de la Tienda", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
  if (up.ok()) {
    await go(page, await verificationLink(OWNER));
    return;
  }
  for (let i = 0; i < 20; i++) {
    if ((await signIn()).ok()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No se pudo iniciar la sesión del dueño");
}

const seed = async (page: Page, items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => { localStorage.setItem(k as string, JSON.stringify(v)); sessionStorage.removeItem("tienda-recomendaciones-ocultas"); }, [KEY, { items, delivery: {}, payment: "", contactName: "", idem: null, ...extra }]);
};
const caja = (q = 1) => ({ productId: "storm-caja", quantity: q, priceMinor: 18500000 });
const sobre = (q: number) => ({ productId: "storm-sobre", quantity: q, priceMinor: 950000 });
const sleeves = (q: number) => ({ productId: SLEEVES, quantity: q, priceMinor: 100000 });
const drawer = (page: Page) => page.getByTestId("cart-drawer");
const openDrawer = async (page: Page) => { await page.locator("[data-cart-trigger]").click(); await expect(drawer(page)).toBeVisible(); };
const recos = (page: Page) => drawer(page).locator("[data-testid=recomendaciones] > ul > li");
const recoIds = async (page: Page) => (await recos(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace("reco-", ""))));
const stockOf = async (page: Page, id: string) => {
  await go(page, "/admin");
  return Number(await page.getByTestId(`admin-fila-${id}`).getByTestId("input-stock").inputValue());
};

test.describe("configuración de la promoción en el panel", () => {
  test("sin configurar está apagada; activarla pide cajas y sobres; se guarda, persiste y queda en el historial", async ({ page }) => {
    await ownerSession(page);
    await go(page, "/admin/promociones");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Promoción caja + sobres");
    await expect(page.getByTestId("combo-activada")).not.toBeChecked();
    await expect(page.getByTestId("cajas-cuenta")).toContainText("0 elegidos");
    await page.getByTestId("combo-activada").check();
    await expect(page.getByTestId("combo-problema")).toContainText("al menos una caja y un sobre");
    await page.getByTestId("combo-guardar").click();
    await expect(page.getByTestId("combo-mensaje")).toContainText("al menos una caja y un sobre");
    await page.getByTestId("combo-cajas-storm-caja").check();
    await page.getByTestId("combo-sobres-storm-sobre").check();
    await page.getByTestId("combo-sobres-parcial-sobre").check();
    await expect(page.getByTestId("combo-problema")).toHaveCount(0);
    await page.getByTestId("combo-guardar").dblclick();
    await expect(page.getByTestId("combo-mensaje")).toContainText("ACTIVADA");
    await page.reload();
    await expect(page.getByTestId("combo-activada")).toBeChecked();
    await expect(page.getByTestId("cajas-cuenta")).toContainText("1 elegidos");
    await expect(page.getByTestId("sobres-cuenta")).toContainText("2 elegidos");
    await expect(page.getByTestId("combo-sobres-storm-sobre")).toBeChecked();
    await expect(page.getByText("«Sumá hasta 5 sobres con 10% OFF por cada caja»")).toBeVisible();
    await go(page, "/admin/historial");
    await expect(page.getByTestId("historial")).toContainText("Promoción caja + sobres");
    await expect(page.getByTestId("historial")).toContainText("activada · 1 cajas · 2 sobres");
    expect(await page.getByTestId("historial").locator("tr", { hasText: "Promoción caja + sobres" }).count()).toBe(1); // el doble clic no la guardó dos veces
  });

  test("solo el administrador la ve y la cambia; las listas solo traen cajas y sobres", async ({ browser, request }) => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const guest = await ctx.newPage();
    await guest.goto("/admin/promociones");
    await expect(guest).toHaveURL(/\/cuenta\/ingresar\?next=/);
    await ctx.close();
    expect((await request.patch(`${BASE}/api/admin/promociones`, { data: { enabled: false, boxIds: [], boosterIds: [], expectedVersion: 0 }, headers: { Origin: BASE } })).status()).toBe(401);
    const page = await (await browser.newContext({ baseURL: BASE })).newPage();
    await ownerSession(page);
    await go(page, "/admin/promociones");
    await expect(page.getByTestId("cajas").locator("input[type=checkbox]")).toHaveCount(2); // storm-caja y ejemplo-caja
    await expect(page.getByTestId("sobres").locator("input[type=checkbox]")).toHaveCount(3);
    const bad = await page.request.patch(`${BASE}/api/admin/promociones`, { data: { enabled: true, boxIds: ["storm-sobre"], boosterIds: [SLEEVES], expectedVersion: 1 }, headers: { Origin: BASE } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).error.message).toMatch(/no es una caja|no es un sobre/);
    await page.context().close();
  });
});

test.describe("accesorios en el catálogo, la ficha y el panel", () => {
  test("formato «Accesorios»: filtro, búsqueda y fichas con «Pack de 5 unidades», precio fijo, imagen ilustrativa y sin secciones de cartas", async ({ page }) => {
    await go(page, "/sellados?formato=accesorios");
    await expect(page.getByRole("status").filter({ hasText: "2 productos" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Sleeves transparentes · Pack de 5 unidades/ }).first()).toBeVisible();
    await go(page, "/sellados?q=top+loaders");
    await expect(page.getByRole("link", { name: /Top loaders transparentes · Pack de 5 unidades/ }).first()).toBeVisible();
    await go(page, "/sellados");
    await expect(page.locator("#f-formato option", { hasText: "Accesorios" })).toHaveCount(1);

    await go(page, `/productos/${SLEEVES}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sleeves transparentes · Pack de 5 unidades");
    await expect(page.getByTestId("precio")).toHaveText(/\$\s?1\.000/);
    await expect(page.getByTestId("precio-usd")).toHaveCount(0); // sin USD inventado
    await expect(page.getByTestId("pack-info")).toContainText("Precio por pack de 5 unidades");
    await expect(page.getByTestId("accesorio-incluye")).toContainText("No incluye cartas");
    await expect(page.getByTestId("accesorio-incluye")).toContainText("ilustración generada");
    await expect(page.getByTestId("galeria-etiqueta")).toContainText("Imagen ilustrativa de una unidad: no es una foto del stock real");
    await expect(page.getByRole("heading", { name: "Probabilidades" })).toHaveCount(0);
    await expect(page.getByTestId("fx-nota")).toHaveCount(0);
    await expect(page.getByTestId("promo-condicion")).toContainText("no cuentan como caja");
    await expect(page.locator("body")).not.toContainText(/marca|espesor.*mm|certificad/i.valueOf() === undefined ? "" : "NO-DEBERIA-APARECER");
    await go(page, `/productos/${TOP}`);
    await expect(page.getByTestId("precio")).toHaveText(/\$\s?3\.500/);
    await expect(page.getByTestId("accesorio-incluye")).toContainText("junto con una sleeve");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pack de 5 unidades");
  });

  test("panel: precio fijo en pesos y packs disponibles; el dueño los edita con historial; no se mezclan monedas", async ({ page }) => {
    await ownerSession(page);
    await go(page, `/admin?q=${encodeURIComponent("sleeves")}`);
    const row = page.getByTestId(`admin-fila-${SLEEVES}`);
    await expect(row.getByTestId("input-ars")).toHaveValue("1000");
    await expect(row.getByTestId("input-usd")).toHaveCount(0);
    await expect(row).toContainText("Pesos fijos: no cambia con el dólar");
    await expect(row.getByLabel(/Stock disponible — packs de 5/)).toHaveValue("20");
    await row.getByTestId("input-ars").fill("1200");
    await row.getByTestId("guardar-fila").click();
    await expect(row.getByTestId("mensaje")).toHaveText("Guardado.");
    await go(page, `/productos/${SLEEVES}`);
    await expect(page.getByTestId("precio")).toHaveText(/\$\s?1\.200/);
    // restablecer el precio a $1.000 para el resto de las pruebas
    await go(page, `/admin?q=${encodeURIComponent("sleeves")}`);
    await page.getByTestId(`admin-fila-${SLEEVES}`).getByTestId("input-ars").fill("1000");
    const guardado = page.waitForResponse((r) => r.url().includes(`/api/admin/products/${SLEEVES}`) && r.request().method() === "PATCH");
    await page.getByTestId(`admin-fila-${SLEEVES}`).getByTestId("guardar-fila").click();
    const body = await (await guardado).json();
    const version = (body.data ?? body).version as number;
    expect(version).toBeGreaterThan(0);
    await expect(page.getByTestId(`admin-fila-${SLEEVES}`).getByTestId("mensaje")).toHaveText("Guardado.");
    await go(page, "/admin/historial?producto=" + SLEEVES);
    await expect(page.getByTestId("historial")).toContainText("Precio fijo (ARS)");
    // mezclar monedas se rechaza en el servidor
    const usd = await page.request.patch(`${BASE}/api/admin/products/${SLEEVES}`, { data: { priceUsdMinor: 1000, expectedVersion: version }, headers: { Origin: BASE } });
    expect(usd.status()).toBe(400);
    const ars = await page.request.patch(`${BASE}/api/admin/products/storm-sobre`, { data: { priceArsMinor: 100000, expectedVersion: 0 }, headers: { Origin: BASE } });
    expect(ars.status()).toBe(400);
    // la ficha del editor muestra «Precio fijo (ARS)» y «Packs disponibles»
    await go(page, `/admin/productos/${SLEEVES}`);
    await expect(page.getByTestId("editor-ars")).toHaveValue("1000");
    await expect(page.getByText("Stock disponible — packs de 5")).toBeVisible();
    await expect(page.getByText("Imagen ilustrativa generada: NO es una foto del stock real", { exact: false })).toBeVisible();
  });
});

test.describe("carrito lateral: combo, importes y recomendaciones", () => {
  test("recomendaciones: sleeve primero, sobre con 10% OFF intercalado, top loader; hasta 3; agregar conserva el panel abierto y recalcula", async ({ page }) => {
    await seed(page, [caja(1)]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(recos(page)).toHaveCount(3);
    expect(await recoIds(page)).toEqual([SLEEVES, "parcial-sobre", TOP]); // sleeve primero; sobre más caro; top loader
    await expect(page.getByTestId("reco-precio-parcial-sobre")).toContainText("$ 11.000");
    await expect(page.getByTestId("reco-precio-parcial-sobre")).toContainText("$ 9.900");
    await expect(page.getByTestId("reco-combo")).toContainText("Sumá hasta 5 sobres con 10% OFF por cada caja");
    await expect(page.getByTestId(`reco-${SLEEVES}`)).toContainText("Protegé tus cartas desde que abrís los sobres.");
    await expect(page.getByTestId(`reco-${TOP}`)).toContainText("Protección rígida para tus mejores cartas. Usalos con una sleeve.");
    await expect(page.getByTestId(`reco-${SLEEVES}`)).toContainText("Pack de 5 unidades");
    await expect(page.getByTestId("drawer-subtotal")).toContainText("185.000");

    // agregar la sleeve: el panel sigue abierto, se suma un pack y la sugerencia se va
    const before = await page.getByTestId("cart-drawer").locator("div.overflow-y-auto").evaluate((el) => (el as HTMLElement).scrollTop);
    await page.getByTestId(`reco-agregar-${SLEEVES}`).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByTestId(`drawer-linea-${SLEEVES}`)).toBeVisible();
    await expect(drawer(page).getByTestId(`drawer-cantidad-${SLEEVES}`)).toHaveValue("1");
    await expect(drawer(page).getByTestId(`drawer-pack-${SLEEVES}`)).toContainText("pack de 5 unidades");
    await expect(page.getByTestId("drawer-subtotal")).toContainText("186.000");
    await expect(page.getByTestId(`reco-${SLEEVES}`)).toHaveCount(0);
    expect(await page.getByTestId("cart-drawer").locator("div.overflow-y-auto").evaluate((el) => (el as HTMLElement).scrollTop)).toBe(before); // la posición del carrito no se movió
    await expect(page.getByRole("heading", { name: "Completá tu compra" })).toBeFocused(); // el foco no se pierde
    await expect(drawer(page).getByRole("status").first()).toContainText("Agregaste 1 Sleeves transparentes");

    // agregar el sobre sugerido: descuento del combo, ahorro por línea y cupos
    await page.getByTestId("reco-agregar-parcial-sobre").click();
    await expect(drawer(page).getByTestId("drawer-linea-parcial-sobre")).toBeVisible();
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveText(/−\s?\$\s?1\.100/);
    await expect(drawer(page).getByTestId("drawer-ahorro-parcial-sobre")).toContainText("Ahorrás $ 1.100");
    await expect(drawer(page).getByTestId("drawer-original-parcial-sobre")).toContainText("11.000");
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("195.900"); // 185.000 + 1.000 + 11.000 − 1.100
    await expect(drawer(page).getByTestId("drawer-cupos")).toContainText("1 de 5 cupos usados; te quedan 4");

    // quitar la caja: el beneficio se recalcula solo y los sobres dejan de sugerirse
    await drawer(page).getByRole("button", { name: /Quitar Storm Emeralda · Caja del carrito/ }).click();
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveCount(0);
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("12.000");
    await expect(drawer(page).getByTestId("reco-parcial-sobre")).toHaveCount(0);
  });

  test("ocultar las sugerencias se respeta durante la sesión y se pueden volver a ver; no se sugiere lo que ya está en el carrito", async ({ page }) => {
    await seed(page, [caja(1), sleeves(1)]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(recos(page)).toHaveCount(3);
    expect(await recoIds(page)).toEqual([TOP, "parcial-sobre", "storm-sobre"]); // con sleeve: top loader + sobres (más caro primero); nada repetido
    await page.getByTestId("ocultar-recomendaciones").click();
    await expect(page.getByTestId("recomendaciones")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await openDrawer(page);
    await expect(page.getByTestId("recomendaciones")).toHaveCount(0);
    await expect(page.getByTestId("recomendaciones-ocultas")).toBeVisible();
    await page.getByRole("button", { name: "Ver sugerencias para completar tu compra" }).click();
    await expect(page.getByTestId("recomendaciones")).toBeVisible();
  });

  test("sin sobres de la promoción ni caja: solo accesorios; con todo en el carrito no hay bloque", async ({ page }) => {
    await seed(page, [sobre(2)]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(recos(page)).toHaveCount(2);
    expect(await recoIds(page)).toEqual([SLEEVES, TOP]); // sin caja participante no se sugieren sobres
    await page.keyboard.press("Escape");
    await seed(page, [sobre(2), sleeves(1), { productId: TOP, quantity: 1, priceMinor: 350000 }]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(drawer(page).getByTestId("drawer-linea-storm-sobre")).toBeVisible();
    await expect(page.getByTestId("recomendaciones")).toHaveCount(0);
  });

  test("teclado y lectores de pantalla: el botón «Agregar» tiene nombre completo y se llega con Tab; Enter agrega", async ({ page }) => {
    await seed(page, [caja(1)]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    const btn = page.getByTestId(`reco-agregar-${SLEEVES}`);
    await expect(btn).toHaveAccessibleName("Agregar Sleeves transparentes · Pack de 5 unidades, Pack de 5 unidades, al carrito");
    await btn.focus();
    await expect(btn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(drawer(page).getByTestId(`drawer-linea-${SLEEVES}`)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Completá tu compra" })).toBeFocused();
    await page.keyboard.press("Tab");
    const foco = await page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? document.activeElement?.getAttribute("aria-label"));
    expect(foco).toBeTruthy(); // el foco sigue dentro del panel (no se escapa al fondo)
    expect(await page.evaluate(() => !!document.activeElement?.closest("[data-testid=cart-drawer]"))).toBe(true);
  });

  test("carrito antiguo (sin título, sin imagen, con el medio de pago viejo) sigue funcionando", async ({ page }) => {
    await go(page, "/");
    await page.evaluate(([k]) => localStorage.setItem(k as string, JSON.stringify({ items: [{ productId: "storm-caja", quantity: 1, priceMinor: 18500000, mode: "buy" }, { productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", contactName: "" })), [KEY]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveText(/−\s?\$\s?1\.900/);
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("202.100");
    await go(page, "/carrito");
    await expect(page.getByTestId("linea-storm-sobre")).toBeVisible();
  });

  test("pedido: importes con combo, transferencia sin doble descuento y alternativa de cuotas; el mensaje y la consulta guardada coinciden", async ({ page }) => {
    await seed(page, [caja(1), sobre(6), sleeves(2)]);
    await go(page, "/carrito");
    await expect(page.getByTestId("linea-storm-sobre")).toBeVisible();
    // sin medio de pago: rige el combo (5 de 6 sobres)
    await expect(page.getByTestId("resumen-descuento-combo")).toHaveText(/−\s?\$\s?4\.750/);
    await expect(page.getByTestId("original-storm-sobre")).toContainText("57.000");
    await expect(page.getByTestId("subtotal-storm-sobre")).toContainText("52.250");
    await expect(page.getByTestId("ahorro-storm-sobre")).toContainText("combo caja + sobres: 10% OFF en 5 sobres");
    await expect(page.getByTestId("resumen-productos")).toContainText("244.000"); // 185.000 + 57.000 + 2.000
    await expect(page.getByTestId("resumen-total-descuento")).toContainText("239.250");
    await expect(page.getByTestId("pack-sleeves-transparentes-pack-5")).toContainText("pack de 5 unidades");
    // transferencia: 10% de los productos de caja y sobres (sin accesorios); el combo no se suma
    await page.getByRole("radio", { name: /Transferencia/ }).check();
    await expect(page.getByTestId("resumen-descuento-combo")).toHaveCount(0);
    await expect(page.getByTestId("resumen-descuento")).toHaveText(/−\s?\$\s?24\.200/); // 10% de (185.000 + 57.000)
    await expect(page.getByTestId("resumen-total-descuento")).toContainText("219.800"); // 244.000 − 24.200
    await expect(page.getByTestId("ahorro-sleeves-transparentes-pack-5")).toHaveCount(0); // los accesorios no reciben el 10%
    // cuotas: vuelve el combo y las cuotas se calculan sobre el total con descuento
    await page.getByRole("radio", { name: /Tarjeta de crédito/ }).check();
    await expect(page.getByTestId("resumen-descuento-combo")).toHaveText(/−\s?\$\s?4\.750/);
    await expect(page.getByTestId("resumen-cuotas")).toContainText("= $ 239.250");
    // la consulta guarda lo mismo que se vio
    await page.getByLabel(/Nombre y apellido/).fill("Inés Muñoz");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await expect(page.getByTestId("vista-previa")).toContainText("Descuento combo caja + sobres: -$ 4.750");
    await expect(page.getByTestId("vista-previa")).toContainText("2 × Sleeves transparentes · Pack de 5 unidades");
    await expect(page.getByTestId("vista-previa")).toContainText("*Total: $ 239.250*");
    await page.getByRole("button", { name: /Continuar por WhatsApp|Preparando/ }).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-[A-Z2-9]{8}/);
    await expect(page.getByTestId("detalle-descuento-combo")).toHaveText(/−\s?\$\s?4\.750/);
    await expect(page.getByTestId("mensaje")).toContainText("*Total: $ 239.250*");
    await expect(page.getByTestId("mensaje")).not.toContainText(/USD|dólar/);
    const ref = page.url().match(/TT-[A-Z2-9]{8}/)![0];
    await page.context().storageState(); // nada que hacer: la referencia queda para la prueba de conversión
    (globalThis as { __ref?: string }).__ref = ref;
  });

  test("manipulación desde el cliente: el servidor recalcula todo y avisa si el total esperado ya no coincide", async ({ page }) => {
    const items = [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1 }, { productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1 }];
    const v = await (await page.request.post(`${BASE}/api/cart/validate`, { data: { items, discountMinor: 99999999, comboDiscountMinor: 99999999, pricing: { totalMinor: 1 } }, headers: { Origin: BASE } })).json();
    expect(v.lines.map((l: { status: string }) => l.status)).toEqual(["price_changed", "price_changed"]);
    expect(v.pricing.base.comboDiscountMinor).toBe(2 * 95000);
    expect(v.pricing.base.totalMinor).toBe(18500000 + 2 * 950000 - 2 * 95000);
    expect(v.pricing.transferencia.comboDiscountMinor).toBe(0);
    expect(v.combo).toMatchObject({ enabled: true, boxes: 1, slots: 5, usedSlots: 2, freeSlots: 3 });
    const inquiry = (data: object) => page.request.post(`${BASE}/api/inquiries`, { data: { items: [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: `e2e${Date.now()}${Math.random().toString(36).slice(2, 10)}`, ...data }, headers: { Origin: BASE } });
    const mala = await inquiry({ expectedTotalMinor: 100 });
    expect(mala.status()).toBe(409);
    expect((await mala.json()).error.code).toBe("price_changed");
    const manipulada = await inquiry({ comboDiscountMinor: 99999999, discountMinor: 99999999, expectedTotalMinor: 18500000 + 2 * 950000 - 2 * 95000 });
    expect(manipulada.status()).toBe(201);
    expect((await manipulada.json()).message).toContain("Descuento combo caja + sobres: -$ 1.900");
  });
});

const FICHA = "/productos/storm-emeralda-caja";
const cap = (page: Page, id: string) => page.getByTestId(`adicional-${id}`);
const addToCart = (page: Page) => page.getByTestId("agregar");
const waitFicha = async (page: Page) => { await go(page, FICHA); await page.locator("html[data-hydrated='true']").waitFor(); };

test.describe("ficha de la caja: sobres con 10% OFF y protección", () => {
  test("bloque de sobres y de protección: opciones compactas, sin nada elegido por defecto y con una sola explicación", async ({ page }) => {
    await waitFicha(page);
    const sobres = page.getByTestId("adicionales-sobres");
    await expect(sobres.getByRole("heading", { name: "Sumá sobres con 10% OFF" })).toBeVisible();
    await expect(sobres).toContainText("Hasta 5 sobres con descuento por cada caja");
    await expect(sobres).toContainText("no reemplazan ni modifican los de la caja");
    await expect(sobres.locator("li")).toHaveCount(2); // solo participantes con stock y precio: storm-sobre y parcial-sobre (ejemplo-sobre no participa)
    await expect(cap(page, "ejemplo-sobre")).toHaveCount(0);
    await expect(page.getByTestId("adicional-precio-parcial-sobre")).toContainText("11.000");
    await expect(page.getByTestId("adicional-precio-parcial-sobre")).toContainText("9.900");
    await expect(page.getByTestId("adicional-precio-parcial-sobre").locator("s")).toHaveText(/11\.000/);
    await expect(page.getByTestId("adicionales-cupos")).toContainText("0 elegidos · te quedan 5 cupos");
    for (const id of ["storm-sobre", "parcial-sobre", SLEEVES, TOP]) await expect(cap(page, id)).toHaveAttribute("data-selected", "false");
    await expect(page.getByTestId("adicionales-desglose")).toHaveCount(0);
    await expect(addToCart(page)).toHaveText("Agregar al carrito");
    // protección: los dos productos existentes, con imagen, presentación de 5 unidades y precio fijo; la explicación se dice una vez
    const prot = page.getByTestId("adicionales-proteccion");
    await expect(prot.getByRole("heading", { name: "Protegé tus cartas" })).toBeVisible();
    await expect(prot).toContainText("top loader se usa junto con una sleeve");
    await expect(cap(page, SLEEVES)).toContainText("Pack de 5 unidades");
    await expect(page.getByTestId(`adicional-precio-${SLEEVES}`)).toHaveText(/\$\s?1\.000/);
    await expect(page.getByTestId(`adicional-precio-${TOP}`)).toHaveText(/\$\s?3\.500/);
    await expect(cap(page, SLEEVES).locator("img")).toHaveCount(1);
    // el orden en la ficha: sobres → protección → cantidad y botón
    const y = async (id: string) => (await page.getByTestId(id).boundingBox())!.y;
    expect(await y("adicionales-sobres")).toBeLessThan(await y("adicionales-proteccion"));
    expect(await y("adicionales-proteccion")).toBeLessThan(await y("agregar"));
    // no se anuncia el 10% OFF en otros lugares de la ficha ni se reserva nada: abrir la ficha no agrega al carrito
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{\"items\":[]}").items.length, KEY)).toBe(0);
  });

  test("elegir sobres y protección: cupos, desglose del servidor y agregar todo junto abre el carrito lateral con el descuento", async ({ page }) => {
    await waitFicha(page);
    await cap(page, "storm-sobre").getByTestId("adicional-elegir-storm-sobre").click();
    await expect(cap(page, "storm-sobre")).toHaveAttribute("data-selected", "true");
    await page.getByTestId("adicional-mas-storm-sobre").click();
    await page.getByTestId("adicional-mas-storm-sobre").click();
    await expect(page.getByTestId("adicional-cantidad-storm-sobre")).toHaveText("3");
    await expect(page.getByTestId("adicionales-cupos")).toContainText("3 elegidos · te quedan 2 cupos");
    await page.getByTestId(`adicional-elegir-${SLEEVES}`).click();
    await expect(addToCart(page)).toHaveText("Agregar caja y adicionales");
    const d = page.getByTestId("adicionales-desglose");
    await expect(d.getByTestId("desglose-caja")).toHaveText(/185\.000/);
    await expect(d.getByTestId("desglose-sobres")).toHaveText(/28\.500/);
    await expect(d.getByTestId("desglose-proteccion")).toHaveText(/1\.000/);
    await expect(d.getByTestId("desglose-ahorro")).toHaveText(/−\s?\$\s?2\.850/);
    await expect(d.getByTestId("desglose-total")).toHaveText(/211\.650/); // 185.000 + 28.500 + 1.000 − 2.850
    // sin reservar nada hasta ahora
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{\"items\":[]}").items.length, KEY)).toBe(0);
    await addToCart(page).dblclick(); // un doble clic no duplica
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-caja")).toHaveValue("1");
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-sobre")).toHaveValue("3");
    await expect(drawer(page).getByTestId(`drawer-cantidad-${SLEEVES}`)).toHaveValue("1");
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveText(/−\s?\$\s?2\.850/);
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("211.650");
    await expect(drawer(page).getByTestId(`reco-${SLEEVES}`)).toHaveCount(0); // ya está en el carrito: no se recomienda
    await page.keyboard.press("Escape");
    // la selección se limpió: no queda nada elegido y el botón vuelve a «Agregar al carrito»
    await expect(cap(page, "storm-sobre")).toHaveAttribute("data-selected", "false");
    await expect(addToCart(page)).toHaveText("Agregar al carrito");
    await expect(page.getByTestId("adicionales-desglose")).toHaveCount(0);
  });

  test("los cupos tienen en cuenta el carrito y la selección: no se puede elegir más de lo que cubre la promoción", async ({ page }) => {
    await seed(page, [caja(1), sobre(4)]);
    await go(page, FICHA);
    await page.locator("html[data-hydrated='true']").waitFor();
    // 1 caja en el carrito + la de esta ficha = 10 cupos; 4 usados por los sobres del carrito
    await expect(page.getByTestId("adicionales-cupos")).toContainText("0 elegidos · te quedan 6 cupos");
    await cap(page, "parcial-sobre").getByTestId("adicional-elegir-parcial-sobre").click();
    for (let n = 1; n < 6; n++) await page.getByTestId("adicional-mas-parcial-sobre").click();
    await expect(page.getByTestId("adicional-cantidad-parcial-sobre")).toHaveText("6");
    await expect(page.getByTestId("adicionales-cupos")).toContainText("6 elegidos · sin cupos libres");
    await expect(page.getByTestId("adicional-mas-parcial-sobre")).toBeDisabled();
    await expect(page.getByTestId("adicional-elegir-storm-sobre")).toBeDisabled(); // sin cupos libres no se pueden elegir más sobres
  });

  test("agregar caja + adicionales vuelve a validar en el servidor: si algo cambió se informa y NO se agrega nada", async ({ page }) => {
    await waitFicha(page);
    await cap(page, "storm-sobre").getByTestId("adicional-elegir-storm-sobre").click();
    await page.getByTestId(`adicional-elegir-${SLEEVES}`).click();
    await expect(page.getByTestId("desglose-total")).toBeVisible();
    await page.route("**/api/cart/adicionales", async (route) => {
      const body = {
        ok: false,
        problems: [{ productId: "storm-sobre", title: "Storm Emeralda · Sobre", status: "out_of_stock", room: 0, unitPriceMinor: 950000, message: "Storm Emeralda · Sobre se quedó sin stock." }],
        breakdown: { boxMinor: 0, boxUnits: 0, boostersListMinor: 0, boostersUnits: 0, boostersDiscountedUnits: 0, protectionMinor: 0, protectionUnits: 0, savingMinor: 0, totalMinor: 0 },
        combo: { enabled: true, boxes: 0, slots: 0, usedSlots: 0, freeSlots: 0 },
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await addToCart(page).click();
    const alerta = page.getByTestId("adicionales-problemas");
    await expect(alerta).toContainText("Revisá tu selección");
    await expect(alerta).toContainText("Storm Emeralda · Sobre se quedó sin stock.");
    await expect(drawer(page)).toHaveCount(0); // no se abrió el carrito
    expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{\"items\":[]}").items.length, KEY)).toBe(0); // y no se agregó un conjunto incompleto
    await expect(cap(page, "storm-sobre")).toHaveAttribute("data-selected", "false"); // el sobre sin stock salió de la selección
    await expect(cap(page, SLEEVES)).toHaveAttribute("data-selected", "true"); // el resto se conserva para revisar
  });

  test("servidor: valida precios, cupos, límites y stock con lo que hay en el carrito; no confía en el navegador y no toca el stock", async ({ page }) => {
    const post = async (cart: object[], add: object[]) => (await page.request.post(`${BASE}/api/cart/adicionales`, { data: { cart, add }, headers: { Origin: BASE } })).json();
    const ok = await post([], [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 18500000 }, { productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }]);
    expect(ok.ok).toBe(true);
    expect(ok.breakdown).toMatchObject({ savingMinor: 190000, totalMinor: 18500000 + 1900000 - 190000 });
    const caro = await post([], [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1 }]);
    expect(caro.problems[0]).toMatchObject({ status: "price_changed" });
    const limite = await post([{ productId: "storm-sobre", quantity: 6 }], [{ productId: "storm-sobre", quantity: 8, expectedPriceMinor: 950000 }]);
    expect(limite.problems[0]).toMatchObject({ status: "over_limit", room: 4 });
    const mal = await page.request.post(`${BASE}/api/cart/adicionales`, { data: { cart: [], add: [] }, headers: { Origin: BASE } });
    expect(mal.status()).toBe(400);
    const ajeno = await page.request.post(`${BASE}/api/cart/adicionales`, { data: { cart: [], add: [{ productId: "storm-sobre", quantity: 1 }] }, headers: { Origin: "https://otro.example" } });
    expect(ajeno.status()).toBe(403);
    // validar no reserva ni descuenta: el máximo comprable del sleeve sigue igual
    const v = await (await page.request.post(`${BASE}/api/cart/validate`, { data: { items: [{ productId: SLEEVES, quantity: 1 }] }, headers: { Origin: BASE } })).json();
    expect(v.lines[0].maxQuantity).toBe(20);
  });

  test("caja que no participa o promoción apagada: no se anuncia el 10% OFF (la protección sí); un sobre no tiene selector", async ({ page }) => {
    // «Set de ejemplo · Caja» no participa (el resto de las pruebas puede haberle fijado el stock, así que solo se verifica que no anuncie el 10%).
    await go(page, "/productos/set-de-ejemplo-caja");
    await expect(page.getByTestId("adicionales-sobres")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Sumá sobres con 10% OFF");
    await go(page, "/productos/storm-emeralda-sobre");
    await expect(page.getByTestId("adicionales")).toHaveCount(0);
    // promoción apagada por el dueño: la caja participante deja de anunciar el descuento y ofrece solo protección
    await ownerSession(page);
    await go(page, "/admin/promociones");
    await page.getByTestId("combo-activada").uncheck();
    await page.getByTestId("combo-guardar").click();
    await expect(page.getByTestId("combo-mensaje")).toContainText("desactivada");
    await go(page, FICHA);
    await expect(page.getByTestId("adicionales-sobres")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("10% OFF por cada caja");
    await expect(page.locator("main")).not.toContainText("Sumá sobres con 10% OFF");
    await expect(page.getByTestId("adicionales-proteccion")).toBeVisible();
    // se vuelve a encender para el resto de las pruebas
    await go(page, "/admin/promociones");
    await page.getByTestId("combo-activada").check();
    await page.getByTestId("combo-guardar").click();
    await expect(page.getByTestId("combo-mensaje")).toContainText("ACTIVADA");
  });

  test("accesibilidad: nombres claros, estado anunciado y manejo con teclado", async ({ page }) => {
    test.setTimeout(90_000);
    await waitFicha(page);
    const elegir = page.getByTestId("adicional-elegir-parcial-sobre");
    await expect(elegir).toHaveAccessibleName(/Elegir sobre /);
    await elegir.focus();
    await page.keyboard.press("Enter");
    await expect(cap(page, "parcial-sobre")).toHaveAttribute("data-selected", "true");
    await expect(page.getByRole("group", { name: /Cantidad de/ })).toBeVisible();
    await expect(page.getByTestId("adicionales-cupos")).toHaveAttribute("aria-live", "polite");
    const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(res.violations.map((v) => `${v.id} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " [" + (n.any[0]?.message ?? "") + "]").join(" | ")}`)).toEqual([]);
  });

  for (const width of [360, 390, 430]) {
    test(`móvil ${width} px: las cápsulas no desbordan ni se superponen, los botones son tocables y la barra inferior sigue accesible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await waitFicha(page);
      await cap(page, "storm-sobre").getByTestId("adicional-elegir-storm-sobre").click();
      await page.getByTestId(`adicional-elegir-${SLEEVES}`).click();
      await expect(page.getByTestId("desglose-total")).toBeVisible();
      const m = await page.evaluate(() => {
        const rect = (sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, w: r.width }; });
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, caps: rect("[data-testid^=adicional-][data-selected]"), btns: rect("[data-testid^=adicional-mas-], [data-testid^=adicional-menos-], [data-testid^=adicional-elegir-]"), vw: window.innerWidth };
      });
      expect(m.overflow).toBeLessThanOrEqual(1);
      for (const c of m.caps) { expect(c.l).toBeGreaterThanOrEqual(0); expect(c.r).toBeLessThanOrEqual(m.vw + 1); }
      for (let i = 1; i < m.caps.length; i++) expect(m.caps[i].t).toBeGreaterThanOrEqual(m.caps[i - 1].b - 1); // no se superponen
      for (const b of m.btns) { expect(b.h).toBeGreaterThanOrEqual(43); expect(b.w).toBeGreaterThanOrEqual(43); }
      // con el botón principal fuera de la vista aparece la barra inferior con el total y «Agregar todo»
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.getByTestId("barra-compra")).toBeVisible();
      await expect(page.getByTestId("barra-compra").getByRole("button", { name: "Agregar caja y adicionales" })).toBeVisible();
      await expect(page.getByTestId("barra-precio")).toContainText("$"); // el total del conjunto, no solo el precio de la caja
      await page.getByTestId("barra-compra").getByRole("button", { name: "Agregar caja y adicionales" }).click();
      await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
      await expect(drawer(page).getByTestId("drawer-linea-storm-sobre")).toBeVisible();
      await expect(drawer(page).getByTestId(`drawer-linea-${SLEEVES}`)).toBeVisible();
    });
  }
});

const setStock = async (owner: Page, id: string, n: number) => {
  await go(owner, `/admin?q=${encodeURIComponent("transparentes")}`);
  const row = owner.getByTestId(`admin-fila-${id}`);
  await row.getByTestId("input-stock").fill(String(n));
  await row.getByTestId("guardar-fila").click();
  await expect(row.getByTestId("mensaje")).toHaveText("Guardado.");
};

test.describe("ficha de la caja: combinaciones, cupos y cambios antes de agregar", () => {
  test("dos cajas y dos tipos de sobres a la vez: cupos del conjunto, desglose y carrito coinciden", async ({ page }) => {
    await waitFicha(page);
    await page.getByRole("button", { name: "Más", exact: true }).click(); // 2 cajas (máximo por pedido: 2)
    await expect(page.getByTestId("adicionales-cupos")).toContainText("0 elegidos · te quedan 10 cupos");
    await page.getByTestId("adicional-elegir-storm-sobre").click();
    await page.getByTestId("adicional-mas-storm-sobre").click();
    await page.getByTestId("adicional-mas-storm-sobre").click();
    await page.getByTestId("adicional-elegir-parcial-sobre").click();
    await page.getByTestId("adicional-mas-parcial-sobre").click();
    await expect(page.getByTestId("adicionales-cupos")).toContainText("5 elegidos · te quedan 5 cupos");
    const d = page.getByTestId("adicionales-desglose");
    await expect(d.getByTestId("desglose-caja")).toHaveText(/370\.000/);
    await expect(d.getByTestId("desglose-sobres")).toHaveText(/50\.500/); // 3 × 9.500 + 2 × 11.000
    await expect(d.getByTestId("desglose-ahorro")).toHaveText(/−\s?\$\s?5\.050/); // 3 × 950 + 2 × 1.100
    await expect(d.getByTestId("desglose-total")).toHaveText(/415\.450/);
    await addToCart(page).click();
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-caja")).toHaveValue("2");
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-sobre")).toHaveValue("3");
    await expect(drawer(page).getByTestId("drawer-cantidad-parcial-sobre")).toHaveValue("2");
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveText(/−\s?\$\s?5\.050/);
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("415.450"); // el total es la suma de las líneas
    await expect(drawer(page).getByTestId("drawer-cupos")).toContainText("5 de 10 cupos usados");
  });

  test("más sobres que cupos y de distinto precio: el descuento va primero a los de mayor precio y no se muestran descontadas unidades de más", async ({ page }) => {
    await seed(page, [sobre(3), { productId: "parcial-sobre", quantity: 4, priceMinor: 1100000 }]); // 7 sobres sin caja
    await go(page, FICHA);
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByTestId("adicionales-cupos")).toContainText("sin cupos libres"); // 7 sobres ya superan los 5 cupos de la caja de esta ficha
    await expect(page.getByTestId("adicional-elegir-storm-sobre")).toBeDisabled();
    await addToCart(page).click(); // agrega solo la caja
    await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
    // 5 cupos: los 4 de $11.000 primero (−$1.100 c/u) y 1 de $9.500 (−$950)
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveText(/−\s?\$\s?5\.350/);
    await expect(drawer(page).getByTestId("drawer-ahorro-parcial-sobre")).toContainText("Ahorrás $ 4.400");
    await expect(drawer(page).getByTestId("drawer-ahorro-storm-sobre")).toContainText("Ahorrás $ 950");
    await expect(drawer(page).getByTestId("drawer-cupos")).toContainText("5 de 5 cupos usados");
    // quitar la caja recalcula: ya no hay descuento
    await drawer(page).getByRole("button", { name: /Quitar Storm Emeralda · Caja del carrito/ }).click();
    await expect(drawer(page).getByTestId("drawer-descuento-combo")).toHaveCount(0);
  });

  test("stock 0 → no se ofrece; cambia el stock después de elegir → se informa y no se agrega nada; con stock positivo vuelve y el reintento funciona", async ({ page, browser }) => {
    test.setTimeout(150_000);
    const ownerCtx = await browser.newContext({ baseURL: BASE });
    const owner = await ownerCtx.newPage();
    await ownerSession(owner);
    try {
      // con stock positivo (inicial de prueba): se ofrece; se eligen un sobre y la sleeve
      await waitFicha(page);
      await page.getByTestId("adicional-elegir-storm-sobre").click();
      await page.getByTestId(`adicional-elegir-${SLEEVES}`).click();
      await expect(page.getByTestId("desglose-total")).toBeVisible();
      // el dueño deja la sleeve sin stock mientras el cliente mira la ficha
      await setStock(owner, SLEEVES, 0);
      await addToCart(page).click();
      const alerta = page.getByTestId("adicionales-problemas");
      await expect(alerta).toContainText("Revisá tu selección");
      await expect(alerta).toContainText("Sleeves transparentes");
      await expect(drawer(page)).toHaveCount(0);
      expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{\"items\":[]}").items.length, KEY)).toBe(0); // nada se agregó
      await expect(cap(page, SLEEVES)).toHaveAttribute("data-selected", "false");
      await expect(cap(page, "storm-sobre")).toHaveAttribute("data-selected", "true"); // lo que sigue siendo válido se conserva
      // una ficha nueva ya no ofrece la sleeve (stock 0) pero sí el top loader; los precios de los accesorios siguen fijos
      await go(page, FICHA);
      await expect(cap(page, SLEEVES)).toHaveCount(0);
      await expect(cap(page, TOP)).toBeVisible();
      await expect(page.getByTestId(`adicional-precio-${TOP}`)).toHaveText(/\$\s?3\.500/);
      // el reintento con lo que sigue siendo válido se agrega completo
      await page.locator("html[data-hydrated='true']").waitFor();
      await page.getByTestId("adicional-elegir-storm-sobre").click();
      await addToCart(page).click();
      await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
      await expect(drawer(page).getByTestId("drawer-linea-storm-sobre")).toBeVisible();
      await expect(drawer(page).getByTestId(`drawer-linea-${SLEEVES}`)).toHaveCount(0);
      await page.keyboard.press("Escape");
    } finally {
      await setStock(owner, SLEEVES, 20); // vuelve el stock de prueba para el resto de las pruebas
      await ownerCtx.close();
    }
    await go(page, FICHA);
    await expect(cap(page, SLEEVES)).toBeVisible(); // con stock positivo se habilita de nuevo
  });

  for (const width of [360, 390, 430]) {
    test(`móvil ${width} px: la ficha no se corre al cargar y lo que se mueve al elegir es la respuesta a un toque (sin saltos inesperados)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        const w = window as unknown as { __shifts: Array<{ v: number; input: boolean; t: number }> };
        w.__shifts = [];
        new PerformanceObserver((list) => { for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) w.__shifts.push({ v: e.value, input: e.hadRecentInput, t: e.startTime }); }).observe({ type: "layout-shift", buffered: true });
      });
      await waitFicha(page);
      await page.waitForTimeout(800);
      const cargar = await page.evaluate(() => (window as unknown as { __shifts: Array<{ v: number }> }).__shifts.reduce((n, e) => n + e.v, 0));
      expect(cargar, `CLS al cargar la ficha en ${width} px`).toBeLessThan(0.05);
      await page.getByTestId("adicional-elegir-storm-sobre").click();
      await expect(page.getByTestId("desglose-total")).toBeVisible();
      await page.waitForTimeout(600);
      // Definición estándar de CLS: los cambios de diseño que ocurren dentro de los 500 ms posteriores a un toque no cuentan (los provoca el usuario).
      const total = await page.evaluate(() => (window as unknown as { __shifts: Array<{ v: number; input: boolean }> }).__shifts.filter((e) => !e.input).reduce((n, e) => n + e.v, 0));
      expect(total, `CLS (sin los cambios provocados por un toque) en ${width} px`).toBeLessThan(0.1);
    });
  }
});

test.describe("accesibilidad y móvil", () => {
  test("axe: panel con sugerencias, ficha de accesorio y configuración", async ({ page }) => {
    test.setTimeout(120_000);
    await ownerSession(page);
    await go(page, "/admin/promociones");
    await expect(page.getByTestId("combo-activada")).toBeChecked(); // la dejó activada la prueba de configuración
    await expect(page.getByTestId("combo-guardar")).toBeDisabled(); // sin cambios no hay nada que guardar
    const check = async (label: string) => {
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(res.violations.map((v) => `${label}: ${v.id} ${v.nodes.length} → ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}]`).join(" | ")}`), label).toEqual([]);
    };
    await check("promociones");
    await go(page, `/productos/${SLEEVES}`);
    await check("ficha accesorio");
    await seed(page, [caja(1)]);
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await openDrawer(page);
    await expect(recos(page)).toHaveCount(3);
    await check("panel con sugerencias");
    await page.keyboard.press("Escape");
    await go(page, "/carrito");
    await check("pedido");
  });

  for (const width of [360, 390, 430]) {
    test(`móvil ${width} px: el panel con sugerencias no desborda ni se superpone con el resumen, y sin saltos de diseño`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => { for (const e of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      });
      await seed(page, [caja(1)]);
      await page.reload();
      await page.locator("html[data-hydrated='true']").waitFor();
      await openDrawer(page);
      await expect(recos(page)).toHaveCount(3);
      const m = await page.evaluate(() => {
        const d = document.querySelector("[data-testid=cart-drawer]")!;
        const scroll = d.querySelector("div.overflow-y-auto")!;
        const footer = d.querySelector("footer")!;
        const reco = d.querySelector("[data-testid=recomendaciones]")!.getBoundingClientRect();
        const f = footer.getBoundingClientRect();
        const s = scroll.getBoundingClientRect();
        return { overflowX: d.scrollWidth - d.clientWidth, innerOverflow: scroll.scrollWidth - scroll.clientWidth, recoBottom: reco.bottom, scrollBottom: s.bottom, footerTop: f.top, recoRight: reco.right, drawerRight: d.getBoundingClientRect().right, h: window.innerHeight, footerH: f.height };
      });
      expect(m.overflowX).toBeLessThanOrEqual(1);
      expect(m.innerOverflow).toBeLessThanOrEqual(1);
      expect(m.recoRight).toBeLessThanOrEqual(m.drawerRight + 1);
      expect(m.footerTop).toBeGreaterThanOrEqual(m.scrollBottom - 1); // el resumen no se superpone con el contenido que se desplaza
      expect(m.footerH).toBeLessThan(m.h * 0.5); // el resumen no se come la pantalla
      // los botones «Agregar» son tocables (≥ 44 px) y no se pisan
      const boxes = await page.locator("[data-testid^=reco-agregar-]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height }; }));
      for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44);
      await page.getByTestId(`reco-agregar-${SLEEVES}`).click();
      await expect(drawer(page).getByTestId(`drawer-linea-${SLEEVES}`)).toBeVisible();
      await page.waitForTimeout(400);
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
      expect(cls, `CLS en ${width} px`).toBeLessThan(0.1);
      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(noOverflow).toBeLessThanOrEqual(1);
    });
  }

  test("las imágenes de los accesorios son livianas (< 80 KB incluso en la variante grande del optimizador) y se piden con las medidas justas", async ({ page }) => {
    const sizes: Record<string, number> = {};
    page.on("response", async (r) => { if (/sleeves-transparentes|top-loaders-transparentes/.test(r.url())) sizes[r.url()] = (await r.body().catch(() => Buffer.alloc(0))).length; });
    await go(page, `/productos/${SLEEVES}`);
    await page.waitForLoadState("networkidle");
    const imgs = await page.locator("main img[src*='sleeves']").evaluateAll((els) => els.map((e) => { const i = e as HTMLImageElement; return { w: i.naturalWidth, rendered: i.getBoundingClientRect().width, loading: i.loading }; }));
    expect(imgs.length).toBeGreaterThan(0);
    for (const v of Object.values(sizes)) expect(v).toBeLessThan(80_000);
    for (const i of imgs.filter((x) => x.rendered > 0)) expect(i.w).toBeLessThanOrEqual(Math.ceil(i.rendered * 2.2)); // no se descargan píxeles de más
  });
});

// Va al final: la venta fija el stock de storm-* y, en el catálogo de prueba, eso deja su precio «pendiente».
test.describe("consulta → venta, stock por pack y anulación", () => {
  test("al convertir, el descuento llega precargado por línea y no se recalcula; el stock baja en packs y la anulación lo devuelve una vez", async ({ page }) => {
    await ownerSession(page);
    const ref = (globalThis as { __ref?: string }).__ref;
    expect(ref).toBeTruthy();
    await go(page, `/admin/consultas/${ref}`);
    await expect(page.getByTestId("original-combo")).toHaveText(/−\s?\$\s?4\.750/);
    await expect(page.getByTestId("original-total")).toContainText("239.250");
    await expect(page.getByTestId("consulta-original")).toContainText("Combo caja + sobres: 10% OFF en 5 sobres");
    await expect(page.getByTestId("consulta-original")).toContainText("(pack de 5)");
    const sleeves0 = await stockOf(page, SLEEVES);
    await go(page, `/admin/consultas/${ref}/convertir`);
    await expect(page.getByTestId("aviso-descuento")).toContainText("no vuelve a calcular ninguna promoción");
    await expect(page.getByTestId("venta-descuento-storm-sobre")).toHaveValue("4750");
    await expect(page.getByTestId("venta-descuento-storm-caja")).toHaveValue("0");
    await expect(page.getByTestId("venta-total-armado")).toContainText("239.250");
    await page.getByTestId("revisar-venta").click();
    await expect(page.getByTestId("venta-resumen")).toBeVisible();
    await expect(page.getByTestId("resumen-descuento-storm-sobre")).toContainText("4.750");
    await expect(page.getByTestId("stock-resultante-sleeves-transparentes-pack-5")).toHaveText(new RegExp(`${sleeves0}\\s*→\\s*${sleeves0 - 2}`)); // 2 packs, no 10 unidades
    await expect(page.getByTestId("venta-total-resumen")).toContainText("239.250");
    await page.getByTestId("confirmar-venta").dblclick();
    await expect(page.getByTestId("venta-registrada-aviso")).toBeVisible();
    expect(await stockOf(page, SLEEVES)).toBe(sleeves0 - 2);
    // la venta muestra el detalle del descuento y el pack
    await go(page, "/admin/ventas");
    await expect(page.getByTestId("venta-desc-storm-sobre")).toContainText("combo caja + sobres");
    await expect(page.locator("body")).toContainText("Sleeves transparentes · Pack de 5 unidades");
    // anular: el stock vuelve una sola vez
    await go(page, `/admin/consultas/${ref}`);
    await page.getByTestId("anular-venta").click();
    await page.getByTestId("motivo-anulacion-consulta").fill("Prueba de anulación");
    await page.getByTestId("confirmar-anular").dblclick();
    await expect(page.getByTestId("detalle-estado")).toHaveText("En seguimiento");
    expect(await stockOf(page, SLEEVES)).toBe(sleeves0);
    // la consulta histórica conserva sus importes aunque el dueño apague la promoción
    await go(page, "/admin/promociones");
    await page.getByTestId("combo-activada").uncheck();
    await page.getByTestId("combo-guardar").click();
    await expect(page.getByTestId("combo-mensaje")).toContainText("desactivada");
    await go(page, `/admin/consultas/${ref}`);
    await expect(page.getByTestId("original-combo")).toHaveText(/−\s?\$\s?4\.750/);
    await expect(page.getByTestId("original-total")).toContainText("239.250");
    // y con la promoción apagada, un carrito nuevo ya no tiene descuento
    // (la venta fijó el stock de storm-* y, en el catálogo de prueba, su precio queda «pendiente»: se verifica el descuento, no el importe)
    const v = await (await page.request.post(`${BASE}/api/cart/validate`, { data: { items: [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1 }, { productId: "storm-sobre", quantity: 2, expectedPriceMinor: 1 }] }, headers: { Origin: BASE } })).json();
    expect(v.combo.enabled).toBe(false);
    expect(v.pricing.base.comboDiscountMinor).toBe(0);
  });
});
