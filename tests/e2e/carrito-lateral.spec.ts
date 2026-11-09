import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { CART_KEY, test } from "./account-helpers";
import { go } from "./helpers";

// Servidor «demo» (catálogo de prueba con precio y stock). Panel lateral del carrito, nombre y apellido, retiro único y método de pago vigente.
const drawer = (page: import("@playwright/test").Page) => page.getByTestId("cart-drawer");
const icono = (page: import("@playwright/test").Page) => page.locator("[data-cart-trigger]");
const seed = async (page: import("@playwright/test").Page, items: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [CART_KEY, { items, delivery: {}, payment: "", contactName: "", idem: null, ...extra }]);
};
const caja = { productId: "storm-caja", quantity: 1, priceMinor: 18500000 };
const sobres = { productId: "storm-sobre", quantity: 2, priceMinor: 950000 };

test.describe("panel lateral del carrito", () => {
  test("el ícono lo abre desde la derecha, vacío ofrece el catálogo y se cierra con Escape devolviendo el foco", async ({ page }) => {
    await go(page, "/sellados");
    await icono(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page)).toContainText("Tu carrito está vacío.");
    const box = (await drawer(page).boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(Math.round(box.x + box.width)).toBe(vw); // pegado al borde derecho
    await expect(drawer(page).getByRole("heading", { name: /Tu carrito/ })).toBeFocused(); // el foco entra al panel
    await page.keyboard.press("Escape");
    await expect(drawer(page)).toHaveCount(0);
    await expect(icono(page)).toBeFocused();
  });

  test("agregar desde la tarjeta lo abre solo; comparte el mismo estado con el pedido sin duplicar ni perder cantidades", async ({ page }) => {
    await go(page, "/sellados");
    await page.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" }).click();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).getByTestId("drawer-linea-storm-sobre")).toContainText("Storm Emeralda · Sobre");
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("9.500");
    await drawer(page).getByRole("button", { name: /Aumentar cantidad de Storm Emeralda · Sobre/ }).click();
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-sobre")).toHaveValue("2");
    await expect(drawer(page).getByTestId("drawer-subtotal")).toContainText("19.000");
    await drawer(page).getByTestId("drawer-continuar").click();
    await expect(page).toHaveURL(/\/carrito$/);
    await expect(page.locator("[data-testid^=linea-]")).toHaveCount(1);
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("2");
    // y al revés: lo que se cambia en el pedido está en el panel
    await page.getByRole("button", { name: "Más" }).first().click();
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("3");
    await page.goto("/sellados");
    await page.locator("html[data-hydrated='true']").waitFor();
    await icono(page).click();
    await expect(drawer(page).getByTestId("drawer-cantidad-storm-sobre")).toHaveValue("3");
    await expect(drawer(page).locator("[data-testid^=drawer-linea-]")).toHaveCount(1);
  });

  test("agregar desde la ficha lo abre; la cantidad se escribe a mano y se ajusta al máximo; quitar actualiza todo", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await expect(drawer(page)).toBeVisible();
    const campo = drawer(page).getByTestId("drawer-cantidad-storm-caja");
    await campo.fill("9");
    await campo.press("Enter");
    await expect(campo).toHaveValue("2"); // máximo 2 por pedido
    await campo.fill("");
    await campo.blur();
    await expect(campo).toHaveValue("2"); // vacío: se conserva lo que había
    await drawer(page).getByRole("button", { name: /Quitar Storm Emeralda · Caja del carrito/ }).click();
    await expect(drawer(page)).toContainText("Tu carrito está vacío.");
    await expect(page.getByTestId("cart-count")).toHaveCount(0);
  });

  test("teclado: Tab no sale del panel, el fondo no se desplaza y se cierra con el fondo o con Escape", async ({ page }) => {
    await seed(page, [caja, sobres]);
    await go(page, "/sellados");
    await icono(page).click();
    await expect(drawer(page)).toBeVisible();
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="cart-drawer"]'))).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="cart-drawer"]'))).toBe(true);
    }
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    // En escritorio queda el fondo oscuro a la izquierda; en el celular el panel ocupa todo el ancho y se cierra con su botón.
    if (page.viewportSize()!.width > 500) await page.mouse.click(5, 300);
    else await drawer(page).getByRole("button", { name: "Cerrar el carrito" }).click();
    await expect(drawer(page)).toHaveCount(0);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  });

  test("sin avisos flotantes que lo tapen y sin errores de accesibilidad con el panel abierto", async ({ page }) => {
    await seed(page, [caja, sobres]);
    await go(page, "/sellados");
    await icono(page).click();
    await expect(drawer(page).getByTestId("drawer-linea-storm-caja")).toBeVisible();
    expect(await page.locator(".cart-toast").count()).toBe(0);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

test.describe("pedido: nombre y apellido, retiro y método de pago", () => {
  test("el nombre y apellido es obligatorio también en el retiro: aviso junto al campo, se conserva lo escrito y llega al resumen y al mensaje", async ({ page }) => {
    await seed(page, [caja]);
    await go(page, "/carrito");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByRole("radio", { name: /Efectivo/ }).check();
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
    const nombre = page.getByLabel(/Nombre y apellido/);
    await expect(nombre).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#err-contactName")).toHaveText("Escribí tu nombre y apellido.");
    await expect(page).toHaveURL(/\/carrito$/);
    await nombre.fill("Ana");
    await expect(page.locator("#err-contactName")).toBeVisible(); // una sola palabra no alcanza
    await nombre.fill("Ana Pérez");
    await expect(page.locator("#err-contactName")).toHaveCount(0);
    await expect(page.getByTestId("resumen-nombre")).toHaveText("Ana Pérez");
    await expect(page.getByTestId("vista-previa")).toContainText("Nombre y apellido: Ana Pérez");
    // otro error en el formulario (método de pago) no borra lo escrito
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await expect(nombre).toHaveValue("Ana Pérez");
  });

  test("el servidor también lo exige: sin nombre responde 400 y no guarda nada", async ({ page }) => {
    await go(page, "/");
    const body = { items: [{ productId: "storm-sobre", quantity: 1 }], delivery: { method: "retiro" }, payment: "efectivo", idempotencyKey: `sin-nombre-${Date.now()}-abcdef` };
    const res = await page.request.post("/api/inquiries", { data: body });
    expect(res.status()).toBe(400);
    const j = await res.json();
    expect(j.error.details.some((d: { path: string }) => d.path === "contactName")).toBe(true);
    expect((await page.request.post("/api/inquiries", { data: { ...body, contactName: "Ana", idempotencyKey: body.idempotencyKey + "1" } })).status()).toBe(400);
    expect((await page.request.post("/api/inquiries", { data: { ...body, contactName: "Ana Pérez", idempotencyKey: body.idempotencyKey + "2" } })).status()).toBe(201);
  });

  test("retiro: una sola opción, con el aviso acordado y sin Ramos Mejía ni Haedo", async ({ page }) => {
    await seed(page, [caja], { contactName: "Ana Pérez", payment: "efectivo" });
    await go(page, "/carrito");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await expect(page.getByTestId("aviso-retiro")).toHaveText("Retiro en Av. Rivadavia 14600. Consultá por WhatsApp el horario para retirar y la dirección exacta.");
    await expect(page.getByLabel("Punto de retiro")).toHaveCount(0);
    await expect(page.getByTestId("resumen-entrega")).toHaveText("Retiro en Av. Rivadavia 14600");
    await expect(page.locator("main")).not.toContainText(/Ramos Mej|Haedo/);
    for (const url of ["/", "/como-comprar", "/condiciones", "/productos/storm-emeralda-caja"]) {
      await go(page, url);
      await expect(page.locator("body")).not.toContainText(/Ramos Mejía \/ Haedo|Ramos Mejía o Haedo|Ramos Mejía y Haedo/);
    }
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).isVisible().catch(() => undefined);
    await go(page, "/carrito");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
    await expect(page.getByTestId("mensaje")).toContainText("Entrega: Retiro en Av. Rivadavia 14600 (horario y dirección exacta a confirmar por WhatsApp)");
  });

  test("un carrito viejo con «Coordinar por WhatsApp» pide elegir un método vigente y no lo deja continuar sin elegir", async ({ page }) => {
    await seed(page, [caja], { payment: "coordinar", contactName: "Ana Pérez", delivery: { method: "retiro", pickupPoint: "haedo" } });
    await go(page, "/carrito");
    await expect(page.getByRole("radio", { name: /A coordinar por WhatsApp/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { checked: true, name: /Tarjeta|Transferencia|Efectivo/ })).toHaveCount(0);
    await expect(page.getByTestId("resumen-pago")).toHaveText("Sin elegir");
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
    await expect(page.locator("#err-payment")).toHaveText("Elegí cómo preferís pagar.");
    await expect(page).toHaveURL(/\/carrito$/);
    await page.getByRole("radio", { name: /Transferencia/ }).check();
    await expect(page.getByTestId("resumen-descuento")).toHaveCount(0);
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
    const msg = page.getByTestId("mensaje");
    await expect(msg).toContainText("*Subtotal: $ 185.000*");
    await expect(msg).toContainText("*Total: $ 185.000*");
    await expect(msg).toContainText("Método de pago: Transferencia");
  });

  test("retiro no lleva envío: el resumen y la vista previa dicen «No aplica: retiro»; al pasar a moto o Andreani vuelve la aclaración", async ({ page }) => {
    await seed(page, [caja], { contactName: "Ana Pérez", payment: "efectivo" });
    await go(page, "/carrito");
    const vista = page.getByTestId("vista-previa");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await expect(page.getByTestId("resumen-envio")).toHaveText("No aplica: retiro");
    await expect(vista).toContainText("Entrega: Retiro en Av. Rivadavia 14600");
    await expect(vista).not.toContainText("Envío:");
    await expect(page.getByTestId("aviso-retiro")).toContainText("Consultá por WhatsApp el horario para retirar y la dirección exacta.");
    await page.getByLabel(/^Moto/).check();
    await expect(page.getByTestId("resumen-envio")).toHaveText("A coordinar");
    await expect(vista).toContainText("Envío: a coordinar");
    await page.getByLabel(/^Andreani/).check();
    await expect(vista).toContainText("Envío: a coordinar");
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await expect(vista).not.toContainText("Envío:");
    await page.getByRole("button", { name: /Continuar por WhatsApp/ }).click();
    await expect(page).toHaveURL(/consulta/);
    await expect(page.getByTestId("mensaje")).not.toContainText("Envío:");
    await expect(page.getByTestId("mensaje")).toContainText("Retiro en Av. Rivadavia 14600 (horario y dirección exacta a confirmar por WhatsApp)");
    await expect(page.getByTestId("detalle-envio")).toHaveText("No aplica: retiro");
  });
});
