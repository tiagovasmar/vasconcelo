import { expect, type Page } from "@playwright/test";
import { CART_KEY, test } from "./account-helpers";
import { go } from "./helpers";

// Servidor «demo» (catálogo de prueba con precio y stock). Cada prueba usa su propia IP de origen.
const caja = { productId: "storm-caja", quantity: 1, priceMinor: 18500000 };
const sobres = { productId: "storm-sobre", quantity: 2, priceMinor: 950000 };
const encargoBundle = { productId: "parcial-bundle", quantity: 1, priceMinor: 0, mode: "encargo" };

const seed = async (page: Page, items: Array<Record<string, unknown>>, payment = "efectivo") => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [CART_KEY, { items, delivery: {}, payment, contactName: "Ana Pérez", idem: null }]);
  await go(page, "/carrito");
};
const pago = (page: Page, name: RegExp) => page.getByRole("radio", { name });

test.describe("promociones: mínimo de una caja", () => {
  test("inicio: franja visible con la condición y sin anunciar el efectivo", async ({ page }) => {
    await go(page, "/");
    const franja = page.getByTestId("franja-promos");
    await expect(franja).toBeVisible();
    await expect(franja).toContainText("3 cuotas sin interés o 10% OFF por transferencia");
    await expect(franja).toContainText("compras que incluyan al menos una caja");
    await expect(page.locator("main")).not.toContainText(/transferencia o efectivo/);
  });

  test("tarjetas: la caja muestra el beneficio con su condición; el sobre dice que se alcanza al sumar una caja", async ({ page }) => {
    await go(page, "/sellados");
    const card = (t: string) => page.locator("article").filter({ has: page.getByRole("heading", { name: t, exact: true }) });
    const c = card("Storm Emeralda · Caja");
    await expect(c.getByTestId("promo-caja")).toContainText("3 cuotas sin interés");
    await expect(c.getByTestId("promo-caja")).toContainText("10% OFF por transferencia");
    await expect(c.getByTestId("promo-caja")).toContainText("al menos una caja");
    const s = card("Storm Emeralda · Sobre");
    await expect(s.getByTestId("promo-condicion")).toContainText("Disponible al sumar una caja a tu pedido");
    await expect(s.getByTestId("promo-caja")).toHaveCount(0);
  });

  test("fichas: caja con beneficio condicionado, sobre y bundle sin beneficio propio", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await expect(page.getByTestId("promo-caja")).toContainText("En compras que incluyan al menos una caja");
    await go(page, "/productos/storm-emeralda-sobre");
    await expect(page.getByTestId("promo-condicion").first()).toContainText("Disponible al sumar una caja a tu pedido");
    await go(page, "/productos/set-parcial-de-ejemplo-bundle");
    await expect(page.getByTestId("promo-condicion").first()).toContainText("no cuenta como caja");
  });

  test("carrito con sobres solos: cuotas y transferencia bloqueadas, sin descuento", async ({ page }) => {
    await seed(page, [sobres]);
    await expect(page.getByTestId("promo-estado")).toContainText("para compras que incluyan al menos una caja");
    await expect(pago(page, /Transferencia/)).toBeDisabled();
    await expect(pago(page, /Tarjeta de crédito/)).toBeDisabled();
    await expect(pago(page, /Efectivo/)).toBeEnabled();
    await expect(pago(page, /Efectivo/)).toBeChecked();
    await expect(page.getByTestId("resumen-descuento")).toHaveCount(0);
    await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
  });

  test("carrito con una caja sola y con caja + sobres: habilita la promoción y aplica el 10% por transferencia (el envío queda aparte)", async ({ page }) => {
    await seed(page, [caja]);
    await expect(page.getByTestId("promo-estado")).toContainText("incluye una caja");
    await pago(page, /Transferencia/).check();
    await expect(page.getByTestId("resumen-descuento")).toContainText("18.500");
    await expect(page.getByTestId("resumen-total-descuento")).toContainText("166.500");
    await expect(page.getByTestId("resumen-envio")).toHaveText("A coordinar");
    // cuotas y descuento no se acumulan: con tarjeta no hay descuento
    await pago(page, /Tarjeta de crédito/).check();
    await expect(page.getByTestId("resumen-descuento")).toHaveCount(0);
    // caja + sobres: el 10% alcanza a todos los productos del pedido que califica
    await seed(page, [caja, sobres], "transferencia");
    await expect(page.getByTestId("resumen-descuento")).toContainText("20.400");
    await expect(page.getByTestId("resumen-total-descuento")).toContainText("183.600");
  });

  test("al quitar la última caja desaparecen los beneficios y se recalcula el resumen", async ({ page }) => {
    await seed(page, [caja, sobres], "transferencia");
    await expect(page.getByTestId("resumen-descuento")).toBeVisible();
    await page.getByRole("button", { name: /Quitar Storm Emeralda · Caja/ }).click();
    await expect(page.getByTestId("resumen-descuento")).toHaveCount(0);
    await expect(pago(page, /Transferencia/)).toBeDisabled();
    // El método de promoción deja de estar elegido y hay que elegir uno vigente (no vuelve a una opción que ya no existe).
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByTestId("resumen-pago")).toHaveText("Sin elegir");
    await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
    await expect(page.getByTestId("vista-previa")).not.toContainText("Descuento por transferencia");
  });

  test("servidor: sobres solos con promoción se rechazan (409) aunque el navegador lo intente; con una caja se acepta", async ({ page, request }) => {
    await go(page, "/");
    const base = { delivery: { method: "retiro" }, contactName: "Ana Pérez", idempotencyKey: `promo-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    const mal = await request.post("/api/inquiries", { data: { ...base, items: [{ productId: "storm-sobre", quantity: 1 }], payment: "transferencia" } });
    expect(mal.status()).toBe(409);
    expect((await mal.json()).error.code).toBe("promo_not_eligible");
    const v = await (await request.post("/api/cart/validate", { data: { items: [{ productId: "storm-sobre", quantity: 1 }] } })).json();
    expect(v.qualifiesForPromo).toBe(false);
    const v2 = await (await request.post("/api/cart/validate", { data: { items: [{ productId: "storm-caja", quantity: 1 }] } })).json();
    expect(v2.qualifiesForPromo).toBe(true);
    const bien = await request.post("/api/inquiries", { data: { ...base, idempotencyKey: base.idempotencyKey + "b", items: [{ productId: "storm-caja", quantity: 1 }], payment: "transferencia" } });
    expect(bien.status()).toBe(201);
  });
});

test.describe("consulta por encargo", () => {
  test("ficha de un producto agotado: se puede consultar por encargo, sin precio ni seña, y no se promete nada", async ({ page }) => {
    await go(page, "/productos/set-parcial-de-ejemplo-bundle");
    await expect(page.getByRole("button", { name: "Agregar al carrito" })).toHaveCount(0);
    const panel = page.getByTestId("pendiente-comercial");
    await expect(panel).toContainText("una seña del 20%");
    await expect(panel).toContainText("saldo restante es del 80%");
    await expect(panel).toContainText("no reserva mercadería");
    await expect(panel).not.toContainText(/\$\s?\d/); // ningún importe de seña inventado
    await page.getByTestId("consultar-encargo").click();
    await expect(page.getByRole("status").filter({ hasText: "consulta por encargo" })).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
  });

  test("carrito solo con encargo: sin precio, sin descuentos, resumen honesto y consulta guardada sin importes", async ({ page }) => {
    await seed(page, [encargoBundle]);
    await expect(page.getByTestId("seccion-encargo")).toBeVisible();
    await expect(page.getByTestId("cotizacion-parcial-bundle")).toHaveText("Cotización a confirmar");
    await expect(page.getByTestId("subtotal-parcial-bundle")).toHaveText("—");
    await expect(page.getByTestId("resumen-encargo")).toContainText("la seña es del 20% de lo cotizado y el saldo del 80%");
    await expect(page.getByTestId("resumen-encargo")).toContainText("Todavía no hay importe ni seña que pagar");
    await expect(page.getByTestId("resumen-subtotal")).toHaveCount(0);
    await expect(pago(page, /Transferencia/)).toBeDisabled();
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
    await page.getByRole("radio", { name: /Efectivo/ }).check();
    await expect(page.getByTestId("vista-previa")).toContainText("Por encargo (disponibilidad y cotización a confirmar)");
    await expect(page.getByTestId("vista-previa")).not.toContainText("$");
    await page.getByRole("button", { name: "Consultar por encargo por WhatsApp" }).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
    await expect(page.getByTestId("nota-encargo")).toContainText("Consultar no reserva mercadería");
    await expect(page.getByTestId("mensaje")).toContainText("¿Me confirmás disponibilidad y cotización de lo que pedí por encargo?");
    await expect(page.getByTestId("mensaje")).not.toContainText("Unitario");
    await expect(page.locator("main")).toContainText("Por encargo · sin cotizar");
  });

  test("pedido mixto: lo disponible y lo que se encarga van separados y la seña no se calcula sobre el carrito completo", async ({ page }) => {
    await seed(page, [sobres, encargoBundle]);
    await expect(page.getByTestId("lineas-compra").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("lineas-encargo").locator("li")).toHaveCount(1);
    await expect(page.getByTestId("resumen-productos")).toContainText("19.000");
    await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
    await expect(page.getByTestId("resumen-encargo")).toBeVisible();
    await expect(page.locator("aside")).not.toContainText(/seña de \$/i);
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
    await page.getByRole("radio", { name: /Efectivo/ }).check();
    await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
    await expect(page.getByTestId("mensaje")).toContainText("Para comprar (disponibles):");
    await expect(page.getByTestId("mensaje")).toContainText("Por encargo (disponibilidad y cotización a confirmar):");
    await expect(page.getByTestId("mensaje")).toContainText("*Subtotal: $ 19.000* (sin los productos por encargo)");
  });

  test("un producto que quedó sin stock en el carrito se puede pasar a consulta por encargo en lugar de solo quitarlo", async ({ page }) => {
    await seed(page, [{ productId: "parcial-bundle", quantity: 1, priceMinor: 6800000 }]);
    await expect(page.getByRole("button", { name: "Continuar por WhatsApp" })).toBeDisabled();
    await page.getByRole("button", { name: "Consultar por encargo" }).click();
    await expect(page.getByTestId("seccion-encargo")).toBeVisible();
    await expect(page.getByTestId("cotizacion-parcial-bundle")).toBeVisible();
  });

  test("servidor: un encargo no acepta un precio del navegador", async ({ page, request }) => {
    await go(page, "/");
    const body = { items: [{ productId: "parcial-bundle", quantity: 2, mode: "encargo", expectedPriceMinor: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: `enc-${Date.now()}-${Math.random().toString(36).slice(2)}`, priceMinor: 1, total: 1 };
    const res = await request.post("/api/inquiries", { data: body });
    expect(res.status()).toBe(201);
    const j = await res.json();
    expect(j.subtotalMinor).toBe(0);
    expect(j.message).not.toMatch(/\$/);
  });
});
