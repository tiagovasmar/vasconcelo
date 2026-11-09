import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

const KEY = "tienda-carrito-v1";
// Chromium en Windows entrega el portapapeles con CRLF: se normaliza para comparar.
const clip = async (page: Page) => (await page.evaluate(() => navigator.clipboard.readText())).split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const seed = async (page: Page, items: Array<{ productId: string; quantity: number; priceMinor: number }>, extra: Record<string, unknown> = {}) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items, delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null, ...extra }]);
};
const open = async (page: Page) => {
  await go(page, "/carrito");
};
const cta = (page: Page) => page.getByRole("button", { name: /Continuar por WhatsApp|Preparando/ });
const base = [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }, { productId: "storm-pack5", quantity: 1, priceMinor: 4200000 }];

async function fillRetiro(page: Page) {
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
}

test.describe("agregar y conservar el carrito", () => {
  test("desde la tarjeta: suma sin duplicar líneas y sobrevive a la recarga", async ({ page }) => {
    await go(page, "/sellados");
    const add = page.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" });
    await add.click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    // Agregar abre solo el panel lateral; se cierra con Escape y devuelve el foco al botón que se tocó.
    await expect(page.getByTestId("cart-drawer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("cart-drawer")).toHaveCount(0);
    await expect(add).toBeFocused();
    await add.click();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await expect(page.getByTestId("drawer-unidades")).toHaveText("(2)");
    await expect(page.getByTestId("drawer-linea-storm-sobre")).toHaveCount(1); // la misma línea, sin duplicar
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await open(page);
    await expect(page.locator("[data-testid^=linea-]")).toHaveCount(1);
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("2");
  });

  test("desde la ficha: cantidad, máximo por pedido y mensaje accesible", async ({ page }) => {
    await go(page, "/productos/storm-emeralda-caja");
    await page.getByRole("button", { name: "Más" }).click();
    await expect(page.getByRole("button", { name: "Más" })).toBeDisabled(); // máximo 2 por pedido
    await page.getByRole("button", { name: "Agregar al carrito" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Agregaste 2 unidades" })).toBeVisible();
    await expect(page.getByTestId("cart-drawer")).toBeVisible(); // también se abre desde la ficha
    await expect(page.getByRole("button", { name: "Máximo en el carrito" })).toBeDisabled();
  });

  test("producto agotado no se puede agregar", async ({ page }) => {
    await go(page, "/productos/set-parcial-de-ejemplo-bundle");
    // agotado: no se compra, pero se puede consultar por encargo (sin reservar nada ni fijar un precio)
    await expect(page.getByRole("button", { name: "Agregar al carrito" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Consultar por encargo" })).toBeVisible();
  });

  test("carrito vacío ofrece volver al catálogo", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
    await page.getByRole("link", { name: "Ver todos los sellados" }).click();
    await expect(page).toHaveURL(/\/sellados/);
  });

  test("datos corruptos en localStorage no rompen el carrito", async ({ page }) => {
    await go(page, "/");
    await page.evaluate((k) => localStorage.setItem(k, "{no es json"), KEY);
    await open(page);
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
  });
});

test.describe("cantidades, importes y avisos", () => {
  test("editar cantidades, quitar y totales: 2 × $9.500 + $42.000 = $61.000 con envío a coordinar", async ({ page }) => {
    await seed(page, base);
    await open(page);
    await expect(page.getByTestId("resumen-subtotal")).toContainText("61.000");
    await expect(page.getByTestId("resumen-envio")).toHaveText("A coordinar");
    await expect(page.getByTestId("subtotal-storm-sobre")).toContainText("19.000");
    await page.getByRole("button", { name: "Más" }).first().click();
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("3");
    await expect(page.getByTestId("resumen-subtotal")).toContainText("70.500");
    await page.getByRole("button", { name: "Menos" }).first().click();
    await page.getByRole("button", { name: /Quitar Pack de 5 sobres/ }).click();
    await expect(page.locator("[data-testid^=linea-]")).toHaveCount(1);
    await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
    // Menos desde 1 quita la línea
    await page.getByRole("button", { name: "Menos" }).first().click();
    await page.getByRole("button", { name: "Quitar del carrito" }).click();
    await expect(page.getByText("Tu carrito está vacío.")).toBeVisible();
    // en ningún momento el envío figura como $0
    await expect(page.locator("body")).not.toContainText(/Envío\s*\$\s?0/);
  });

  test("precio cambiado: avisa y exige confirmar antes de continuar", async ({ page }) => {
    await seed(page, [{ productId: "storm-caja", quantity: 1, priceMinor: 17000000 }]);
    await open(page);
    const alert = page.getByRole("alert").filter({ hasText: "Cambió el precio" });
    await expect(alert).toContainText("$ 170.000");
    await expect(alert).toContainText("$ 185.000");
    await expect(cta(page)).toBeDisabled();
    await alert.getByRole("button", { name: "Aceptar el nuevo precio" }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByTestId("resumen-subtotal")).toContainText("185.000");
    await expect(cta(page)).toBeEnabled();
  });

  test("agotado y retirado del catálogo: avisa y bloquea hasta quitarlos", async ({ page }) => {
    await seed(page, [{ productId: "parcial-bundle", quantity: 1, priceMinor: 6800000 }, { productId: "ya-no-existe", quantity: 1, priceMinor: 100 }, ...base.slice(0, 1)]);
    await open(page);
    await expect(page.getByText("Sin stock por ahora.")).toBeVisible();
    await expect(page.getByText("Este producto ya no está en el catálogo.")).toBeVisible();
    await expect(cta(page)).toBeDisabled();
    await page.getByRole("button", { name: /Quitar Booster bundle/ }).click();
    await page.getByRole("button", { name: /Quitar producto del carrito/ }).click();
    await expect(page.locator("[data-testid^=linea-]")).toHaveCount(1);
    await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
  });

  test("cantidad por encima del stock o del límite se ajusta con aviso", async ({ page }) => {
    await seed(page, [{ productId: "storm-caja", quantity: 9, priceMinor: 18500000 }]);
    await open(page);
    await expect(page.getByTestId("cantidad-storm-caja")).toHaveText("2");
    await expect(page.getByText(/Ajustamos la cantidad de «Storm Emeralda · Caja» a 2/)).toBeVisible();
  });

  test("carrito con cantidades inválidas guardadas se sanea", async ({ page }) => {
    await seed(page, [{ productId: "storm-sobre", quantity: -3, priceMinor: 950000 }, { productId: "storm-pack5", quantity: 1.5, priceMinor: 4200000 }, { productId: "storm-sobre", quantity: 1, priceMinor: 950000 }]);
    await open(page);
    await expect(page.locator("[data-testid^=linea-]")).toHaveCount(1);
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("1");
  });
});

test.describe("entrega, pago y consulta", () => {
  test("errores de entrega: campos obligatorios y formatos, con foco en el aviso", async ({ page }) => {
    await seed(page, base);
    await open(page);
    await cta(page).click();
    await expect(page.getByText("Elegí cómo querés recibirlo.")).toBeVisible();
    await page.getByLabel(/^Andreani/).check();
    await cta(page).click();
    await expect(page.getByText("Localidad: obligatorio")).toBeVisible();
    await expect(page.getByText("Provincia: elegí una opción")).toBeVisible();
    await expect(page.getByLabel("Código postal")).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Localidad").fill("Ramos Mejía");
    await page.getByLabel("Provincia").selectOption("Buenos Aires");
    await page.getByLabel("Código postal").fill("17");
    await expect(page.getByText(/Código postal inválido/)).toBeVisible();
    await page.getByLabel("Código postal").fill("B1704ABC");
    await expect(page.getByText(/Código postal inválido/)).toBeHidden();
    await page.getByLabel(/^Moto/).check();
    await expect(page.getByLabel("Provincia")).toHaveCount(0); // moto no pide provincia
    await page.getByRole("radio", { name: /Retiro/ }).check();
    // Un único punto de retiro: no hay selector de sucursal, solo el aviso acordado.
    await expect(page.getByLabel("Punto de retiro")).toHaveCount(0);
    await expect(page.getByTestId("aviso-retiro")).toHaveText("Retiro en Av. Rivadavia 14600. Consultá por WhatsApp el horario para retirar y la dirección exacta.");
    await expect(page.locator("main")).not.toContainText(/Ramos Mej|Haedo/);
    // no se pide DNI ni dirección completa
    await expect(page.locator("body")).not.toContainText(/DNI|Calle y número/);
  });

  test("limpia la preferencia de cuotas anterior y ofrece los métodos actuales", async ({ page }) => {
    await seed(page, [...base, { productId: "storm-caja", quantity: 1, priceMinor: 18500000 }], { payment: "tarjeta-3-cuotas", contactName: "" });
    await open(page);
    // «Coordinar por WhatsApp» ya no existe y no hay un método elegido de antemano: queda a elección.
    await expect(page.getByRole("radio", { name: /A coordinar por WhatsApp/ })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /transferencia|efectivo|tarjeta/i })).toHaveCount(2);
    await expect(page.getByRole("radio", { checked: true, name: /transferencia|efectivo|tarjeta/i })).toHaveCount(0);
    await expect(page.getByRole("radio", { name: /Tarjeta de crédito/ })).toHaveCount(0);
    await page.getByRole("radio", { name: /^Moto/ }).check();
    await expect(page.getByRole("region", { name: "¿Cómo preferís pagar?" })).toContainText("En CABA, Ramos Mejía y alrededores podés pagar al recibir.");
    await page.getByRole("radio", { name: /Transferencia/ }).check();
    await expect(page.getByTestId("vista-previa")).toContainText("Transferencia");
  });

  test("recorrido completo en modo demo: consulta guardada, vista previa, copiar y carrito conservado", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "permisos de portapapeles");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seed(page, base);
    await open(page);
    await page.getByLabel(/^Andreani/).check();
    await page.getByLabel("Localidad").fill("Ramos Mejía");
    await page.getByLabel("Provincia").selectOption("Buenos Aires");
    await page.getByLabel("Código postal").fill("1704");
    await page.getByLabel(/Nombre y apellido/).fill("Inés Muñoz");
    await expect(page.getByTestId("vista-previa")).toContainText("Hola, soy Inés Muñoz. Quiero consultar este pedido:");
    await expect(page.getByTestId("vista-previa")).toContainText("*Subtotal: $ 61.000*");
    await expect(page.getByTestId("vista-previa")).toContainText("*Total: $ 61.000*");
    await expect(page.getByText("Modo demostración: se prepara tu consulta")).toBeVisible();
    await cta(page).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-[A-Z2-9]{8}/);
    await expect(page.getByTestId("modo-demo")).toBeVisible();
    await expect(page.getByText("Todavía no enviaste nada.")).toBeVisible();
    const msg = page.getByTestId("mensaje");
    await expect(msg).toContainText("Envío: a coordinar");
    await expect(msg).toContainText("Entrega: Andreani · Ramos Mejía, Buenos Aires (CP 1704)");
    await expect(msg).toContainText("Método de pago: Efectivo · a coordinar");
    await expect(msg).toContainText("Nombre y apellido: Inés Muñoz");
    await expect(page.getByTestId("abrir-whatsapp")).toHaveCount(0); // sin teléfono no hay enlace a un chat
    await page.getByTestId("copiar-mensaje").click();
    await expect(page.getByTestId("copiado")).toHaveText("Mensaje copiado.");
    expect(await clip(page)).toBe(await msg.textContent());
    // recargar conserva la consulta (misma sesión) y el carrito sigue intacto
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByTestId("mensaje")).toContainText("Referencia: TT-");
    await page.getByRole("link", { name: /Volver al carrito/ }).click();
    await expect(page.getByTestId("resumen-subtotal")).toContainText("61.000");
    await expect(page.getByTestId("cart-count")).toHaveText("3");
  });

  test("otra persona no puede abrir la consulta aunque tenga la referencia", async ({ page, browser }) => {
    await seed(page, base);
    await open(page);
    await fillRetiro(page);
    await cta(page).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
    const url = page.url().split("?")[0];
    const other = await browser.newContext();
    const res = await (await other.newPage()).goto(url);
    expect(res?.status()).toBe(404);
    await other.close();
  });

  test("si falla la red no se afirma que se guardó y se puede reintentar", async ({ page }) => {
    await seed(page, base);
    await open(page);
    await fillRetiro(page);
    await page.route("**/api/inquiries", (r) => r.abort());
    await cta(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "No sabemos si llegó a guardarse" })).toBeVisible();
    await expect(page).toHaveURL(/\/carrito$/);
    await page.unroute("**/api/inquiries");
    await cta(page).click();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
  });

  test("un error del servidor se muestra y el carrito no se pierde", async ({ page }) => {
    await seed(page, base);
    await open(page);
    await fillRetiro(page);
    await page.route("**/api/inquiries", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "persistence_error", message: "No pudimos guardar tu consulta. Intentá de nuevo." } }) }));
    await cta(page).click();
    await expect(page.getByRole("alert").filter({ hasText: "No pudimos guardar tu consulta" })).toBeVisible();
    await expect(page.getByTestId("resumen-subtotal")).toContainText("61.000");
  });

  test("si el precio cambia justo al enviar, el servidor lo avisa y no guarda", async ({ page }) => {
    await seed(page, base);
    await open(page);
    await fillRetiro(page);
    // simula que el cliente tenía otro precio guardado: el servidor responde 409
    await page.evaluate((k) => {
      const s = JSON.parse(localStorage.getItem(k)!);
      s.items[0].priceMinor = 1;
      localStorage.setItem(k, JSON.stringify(s));
    }, KEY);
    await page.route("**/api/cart/validate", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lines: [] }) }));
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
    await page.getByRole("radio", { name: /Efectivo/ }).check();
    await page.unroute("**/api/cart/validate");
    // la validación vacía deja el carrito en "verificando"; se fuerza el envío directo a la API real
    const res = await page.request.post("/api/inquiries", { data: { items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: "clave-e2e-precio-0000001" } });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("price_changed");
  });
});

test.describe("API: el servidor es la fuente de verdad", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez",
    idempotencyKey: `clave-e2e-${Math.random().toString(36).slice(2)}-aaaa`, ...over,
  });

  test("precio, título y total enviados por el navegador se ignoran", async ({ request }) => {
    const res = await request.post("/api/inquiries", { data: body({ items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: 950000, price: 1, title: "Gratis", total: 1 }], total: 1 }) });
    expect(res.status()).toBe(201);
    const json = await res.json();
    expect(json.subtotalMinor).toBe(1900000);
    expect(json.message).toContain("Storm Emeralda · Sobre");
    expect(json.message).not.toContain("Gratis");
  });

  test("misma clave + mismo contenido = una consulta; otro contenido = error", async ({ request }) => {
    await request.get("/carrito"); // como en el navegador: la cookie de sesión ya existe antes de enviar
    const data = body();
    const [a, b] = await Promise.all([request.post("/api/inquiries", { data }), request.post("/api/inquiries", { data })]);
    const ja = await a.json();
    const jb = await b.json();
    expect(ja.reference).toBe(jb.reference);
    expect([a.status(), b.status()].sort()).toEqual([200, 201]);
    const c = await request.post("/api/inquiries", { data: { ...data, items: [{ productId: "storm-sobre", quantity: 3 }] } });
    expect(c.status()).toBe(422);
    expect((await c.json()).error.code).toBe("idempotency_conflict");
  });

  test("cantidades negativas, fraccionarias, SKU desconocido, agotado y límite", async ({ request }) => {
    for (const q of [-1, 0, 1.5]) {
      expect((await request.post("/api/inquiries", { data: body({ items: [{ productId: "storm-sobre", quantity: q }] }) })).status()).toBe(400);
    }
    expect((await request.post("/api/inquiries", { data: body({ items: [{ productId: "nada", quantity: 1 }] }) })).status()).toBe(409);
    expect((await request.post("/api/inquiries", { data: body({ items: [{ productId: "parcial-bundle", quantity: 1 }] }) })).status()).toBe(409);
    expect((await request.post("/api/inquiries", { data: body({ items: [{ productId: "storm-caja", quantity: 3 }] }) })).status()).toBe(409);
    expect((await request.post("/api/inquiries", { data: "no es json", headers: { "Content-Type": "application/json" } })).status()).toBe(400);
  });

  test("protección de origen: un POST desde otro sitio se rechaza", async ({ request }) => {
    const res = await request.post("/api/inquiries", { data: body(), headers: { Origin: "https://sitio-malicioso.example" } });
    expect(res.status()).toBe(403);
  });

  test("validar carrito devuelve precios vigentes del catálogo", async ({ request }) => {
    const res = await request.post("/api/cart/validate", { data: { items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 5 }] } });
    const json = await res.json();
    expect(json.lines[0]).toMatchObject({ status: "price_changed", unitPriceMinor: 950000, previousPriceMinor: 5 });
  });
});
