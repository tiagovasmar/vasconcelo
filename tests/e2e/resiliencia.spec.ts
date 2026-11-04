import fs from "node:fs";
import postgres from "postgres";
import path from "node:path";
import { expect, test as base, type Page, type Route } from "@playwright/test";
import { go } from "./helpers";

/**
 * Recuperación ante conexiones lentas, cortes de red y errores de carga. Servidor «resil» (:3106, build de producción, catálogo de prueba, base PostgreSQL
 * descartable propia). Las fallas se inyectan con `page.route` (demoras, silencios, HTTP 500/429, descargas de módulos que fallan); nada toca datos reales.
 * Los plazos de la aplicación son 8 s (desglose), 10 s (validar) y 20 s (preparar la consulta): las pruebas de «silencio total» esperan ese tiempo de verdad.
 */
const stamp = process.env.E2E_STAMP!;
const BASE = "http://localhost:3106";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const mailDir = path.resolve(`.local/data/e2e-${stamp}-resil-mail`);
const KEY = "tienda-carrito-v1";

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});

async function verificationLink(to: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(mailDir) ? fs.readdirSync(mailDir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mailDir, f), "utf8")) as { to: string; kind: string; link: string }).filter((m) => m.to === to && m.kind === "verificacion") : [];
    if (found.length) return found[found.length - 1].link;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo de confirmación para ${to}`);
}

/** Enciende la promoción caja + sobres (una vez por base): sin ella la ficha no ofrece sobres con descuento. */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  const page = await ctx.newPage();
  const signIn = () => page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: OWNER, password: PASSWORD }, headers: { Origin: BASE } });
  if (!(await signIn()).ok()) {
    const up = await page.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de la Tienda", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
    if (up.ok()) {
      await page.request.post(`${BASE}/api/auth/send-verification-email`, { data: { email: OWNER, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
      await go(page, await verificationLink(OWNER));
    }
    else for (let i = 0; i < 20 && !(await signIn()).ok(); i++) await new Promise((r) => setTimeout(r, 500));
  }
  // La segunda pasada (móvil) encuentra la promoción ya encendida: el 409/400 por versión es esperado.
  await page.request.patch(`${BASE}/api/admin/promociones`, { data: { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "parcial-sobre"], expectedVersion: 0 }, headers: { Origin: BASE } });
  await ctx.close();
});

/** La ficha dibuja el bloque de compra dos veces (celular y escritorio) y oculta uno con CSS: siempre se trabaja con el visible. */
const T = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`);

const ADICIONALES = "**/api/cart/adicionales";
const VALIDAR = "**/api/cart/validate";
const CONSULTAS = "**/api/inquiries";
const hang = () => new Promise<void>(() => {});
const fail = (status: number, code = "boom", message = "Error simulado") => (r: Route) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: { code, message } }) });

const seed = async (page: Page, items: Array<{ productId: string; quantity: number; priceMinor: number }>, extra: Record<string, unknown> = {}) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items, delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null, ...extra }]);
};
const cartItems = (page: Page) => page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{"items":[]}').items as Array<{ productId: string; quantity: number }>), KEY);
const fichaCaja = async (page: Page) => {
  await go(page, "/productos/storm-emeralda-caja");
  await expect(T(page, "adicionales")).toBeVisible();
};
const elegirSobre = (page: Page) => T(page, "adicional-elegir-storm-sobre").click();
const desglose = (page: Page) => T(page, "adicionales-desglose");
const listo = (page: Page) => expect(desglose(page)).toHaveAttribute("data-estado", "listo", { timeout: 10_000 });
const enError = (page: Page, timeout = 13_000) => expect(desglose(page)).toHaveAttribute("data-estado", "error", { timeout });

test.describe("cálculo de adicionales en la ficha", () => {
  test("respuesta lenta: se ve «Calculando…», después el total, y la selección no se pierde", async ({ page }) => {
    await fichaCaja(page);
    await page.route(ADICIONALES, async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });
    await elegirSobre(page);
    await expect(desglose(page)).toHaveAttribute("data-estado", "calculando");
    await expect(desglose(page)).toContainText("Calculando tu selección");
    await listo(page);
    await expect(T(page, "desglose-total")).toContainText("$");
    await expect(T(page, "adicional-cantidad-storm-sobre")).toHaveText("1");
  });

  test("el servidor no contesta: a los 8 s hay un error claro con «Reintentar», sin total, y la selección sigue ahí", async ({ page }) => {
    await fichaCaja(page);
    await page.route(ADICIONALES, hang);
    await elegirSobre(page);
    await expect(desglose(page)).toHaveAttribute("data-estado", "calculando");
    await enError(page);
    await expect(desglose(page)).toContainText("lenta");
    await expect(T(page, "desglose-total")).toHaveCount(0); // ningún total, ni viejo ni inventado
    await expect(T(page, "adicional-cantidad-storm-sobre")).toHaveText("1");
    await expect(page.getByRole("alert").filter({ hasText: "No pudimos calcular tu selección" })).toBeVisible();
    await page.unroute(ADICIONALES);
    await T(page, "adicionales-reintentar").click();
    await listo(page);
    await expect(T(page, "desglose-total")).toContainText("$");
    await expect(T(page, "adicional-cantidad-storm-sobre")).toHaveText("1");
  });

  for (const [status, texto] of [[500, "de nuestro lado"], [429, "demasiadas solicitudes"], [502, "de nuestro lado"]] as const) {
    test(`HTTP ${status}: mensaje propio del fallo, sin total, y cambiar la selección vuelve a calcular`, async ({ page }) => {
      await fichaCaja(page);
      await page.route(ADICIONALES, fail(status));
      await elegirSobre(page);
      await enError(page, 5000);
      await expect(desglose(page)).toContainText(texto);
      await expect(T(page, "desglose-total")).toHaveCount(0);
      await page.unroute(ADICIONALES);
      await T(page, "adicional-mas-storm-sobre").click(); // otra selección: se vuelve a pedir sola
      await listo(page);
      await expect(T(page, "desglose-sobres")).toContainText("$");
      await expect(desglose(page)).toContainText("Sobres adicionales × 2");
    });
  }

  test("sin conexión: error de red; al volver, «Reintentar» recupera", async ({ page }) => {
    await fichaCaja(page);
    await page.route(ADICIONALES, (r) => r.abort("connectionrefused"));
    await elegirSobre(page);
    await enError(page, 5000);
    await expect(desglose(page)).toContainText("conexión");
    await page.unroute(ADICIONALES);
    await T(page, "adicionales-reintentar").click();
    await listo(page);
  });

  test("tras un error, un total anterior no se muestra como si fuera de la selección nueva", async ({ page }) => {
    await fichaCaja(page);
    await elegirSobre(page);
    await listo(page);
    await expect(desglose(page)).toContainText("Sobres adicionales × 1");
    await page.route(ADICIONALES, fail(500));
    await T(page, "adicional-mas-storm-sobre").click();
    await enError(page, 5000);
    await expect(T(page, "desglose-total")).toHaveCount(0);
    await expect(desglose(page)).not.toContainText("× 1");
  });

  test("respuestas fuera de orden: la de la selección vieja nunca pisa a la nueva", async ({ page }) => {
    await fichaCaja(page);
    let n = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ADICIONALES, async (r) => {
      n++;
      if (n === 1) {
        await gate; // la primera respuesta (1 sobre) llega MUY tarde
        await r.continue().catch(() => {});
      } else await r.continue();
    });
    await elegirSobre(page);
    await expect.poll(() => n).toBe(1);
    await T(page, "adicional-mas-storm-sobre").click(); // 2 sobres
    await listo(page);
    await expect(desglose(page)).toContainText("Sobres adicionales × 2");
    release();
    await page.waitForTimeout(800);
    await expect(desglose(page)).toContainText("Sobres adicionales × 2");
    await expect(desglose(page)).not.toContainText("Sobres adicionales × 1");
    await expect(desglose(page)).toHaveAttribute("data-estado", "listo");
  });
});

test.describe("agregar la caja y los adicionales", () => {
  test("error del servidor al validar: no se agrega nada, el botón se libera, se conserva la selección y «Reintentar» funciona", async ({ page }) => {
    await fichaCaja(page);
    await elegirSobre(page);
    await listo(page);
    await page.route(ADICIONALES, fail(500));
    await T(page, "agregar").click();
    const alerta = T(page, "adicionales-error-agregar");
    await expect(alerta).toContainText("No agregamos nada al carrito");
    await expect(T(page, "agregar")).toBeEnabled();
    await expect(T(page, "agregar")).toHaveText("Agregar caja y adicionales");
    expect(await cartItems(page)).toEqual([]);
    await expect(T(page, "adicional-cantidad-storm-sobre")).toHaveText("1");
    await page.unroute(ADICIONALES);
    await T(page, "agregar-reintentar").click();
    await expect(T(page, "cart-drawer")).toBeVisible();
    expect((await cartItems(page)).map((i) => i.productId).sort()).toEqual(["storm-caja", "storm-sobre"]);
  });

  test("el servidor no contesta: «Validando…» se libera a los 10 s con un aviso, sin tocar el carrito", async ({ page }) => {
    await fichaCaja(page);
    await elegirSobre(page);
    await listo(page);
    await page.route(ADICIONALES, hang);
    await T(page, "agregar").click();
    await expect(T(page, "agregar")).toHaveText("Validando…");
    await expect(T(page, "agregar")).toBeDisabled();
    await expect(T(page, "adicionales-error-agregar")).toContainText("lenta", { timeout: 14_000 });
    await expect(T(page, "agregar")).toBeEnabled();
    expect(await cartItems(page)).toEqual([]);
  });

  test("si cambia la selección mientras se valida, no se agrega lo viejo ni se pisa lo nuevo", async ({ page }) => {
    await fichaCaja(page);
    await elegirSobre(page);
    await listo(page);
    let hold = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route(ADICIONALES, async (r) => {
      if (hold) {
        hold = false;
        await gate;
        await r.continue().catch(() => {});
      } else await r.continue();
    });
    hold = true;
    await T(page, "agregar").click(); // la validación queda en espera
    await T(page, "adicional-mas-storm-sobre").click(); // ahora son 2 sobres
    release();
    await expect(T(page, "adicionales-error-agregar")).toContainText("Cambiaste tu selección");
    await expect(T(page, "adicional-cantidad-storm-sobre")).toHaveText("2");
    expect(await cartItems(page)).toEqual([]);
  });
});

test.describe("cupos de sobres con descuento", () => {
  test("con la caja ya en su máximo del carrito, la ficha no suma una caja que no puede agregarse (antes: 14 cupos en vez de 9)", async ({ page }) => {
    await seed(page, [{ productId: "storm-caja", quantity: 2, priceMinor: 18500000 }]);
    await fichaCaja(page);
    await expect(T(page, "agregar")).toHaveText("Máximo en el carrito");
    await expect(T(page, "adicionales-cupos")).toContainText("te quedan 10 cupos"); // 2 cajas × 5
    await elegirSobre(page);
    await expect(T(page, "adicionales-cupos")).toContainText("te quedan 9 cupos");
    // Coincide con el carrito (servidor): 10 cupos habilitados por las 2 cajas.
    await T(page, "cart-count").waitFor();
    await page.locator("[data-cart-trigger]").click();
    await expect(T(page, "drawer-cupos")).toContainText("0 de 10 cupos usados");
  });

  test("con una caja en el carrito y lugar para otra: la que se va a agregar sí cuenta", async ({ page }) => {
    await seed(page, [{ productId: "storm-caja", quantity: 1, priceMinor: 18500000 }, { productId: "storm-sobre", quantity: 3, priceMinor: 950000 }]);
    await fichaCaja(page);
    await expect(T(page, "adicionales-cupos")).toContainText("te quedan 7 cupos"); // (1 + 1) × 5 − 3
    await elegirSobre(page);
    await expect(T(page, "adicionales-cupos")).toContainText("te quedan 6 cupos");
  });
});

test.describe("verificación del carrito y envío de la consulta", () => {
  const sobres = [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }];
  const cta = (page: Page) => page.getByRole("button", { name: /Continuar por WhatsApp|Preparando/ });
  const abrirPedido = async (page: Page) => {
    await seed(page, sobres);
    await go(page, "/carrito");
  };
  async function completar(page: Page) {
    await page.getByRole("radio", { name: /Retiro/ }).check();
    await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
    await page.getByRole("radio", { name: /Efectivo/ }).check();
  }

  test("la verificación del pedido no responde: a los 10 s se muestra el error con «Reintentar», el carrito se conserva y reintentar funciona", async ({ page }) => {
    await seed(page, sobres);
    await page.route(VALIDAR, hang);
    await go(page, "/carrito");
    await expect(T(page, "verificando-pedido")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "No pudimos verificar precios y disponibilidad" })).toBeVisible({ timeout: 14_000 });
    await expect(T(page, "cantidad-storm-sobre")).toHaveText("2");
    await expect(cta(page)).toBeDisabled(); // no se continúa sin verificar
    await page.unroute(VALIDAR);
    await page.getByRole("button", { name: "Reintentar" }).first().click();
    await expect(T(page, "resumen-productos")).toContainText("$");
    await expect(cta(page)).toBeEnabled();
  });

  for (const [status, texto] of [[500, "de nuestro lado"], [429, "demasiadas solicitudes"]] as const) {
    test(`la verificación responde HTTP ${status}: mensaje claro, sin importes inventados`, async ({ page }) => {
      await seed(page, sobres);
      await page.route(VALIDAR, fail(status));
      await go(page, "/carrito");
      const alerta = page.getByRole("alert").filter({ hasText: "No pudimos verificar" });
      await expect(alerta).toContainText(texto);
      await expect(T(page, "resumen-total-descuento")).toHaveCount(0);
      await expect(cta(page)).toBeDisabled();
      expect(await cartItems(page)).toHaveLength(1);
    });
  }

  test("el panel lateral muestra el mismo error y permite reintentar", async ({ page }) => {
    await seed(page, sobres);
    await go(page, "/sellados");
    await page.route(VALIDAR, fail(500));
    await page.locator("[data-cart-trigger]").click();
    const drawer = T(page, "cart-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("alert")).toContainText(/no pudimos verificar/i);
    await page.unroute(VALIDAR);
    await drawer.getByRole("button", { name: "Reintentar" }).click();
    await expect(drawer.getByRole("alert")).toHaveCount(0);
    await expect(T(page, "drawer-subtotal")).toContainText("$");
  });

  test("la consulta no responde: a los 20 s se libera el botón, se avisa que no se sabe si se guardó y los datos siguen", async ({ page }) => {
    test.setTimeout(70_000);
    await abrirPedido(page);
    await completar(page);
    await page.route(CONSULTAS, hang);
    await cta(page).click();
    await expect(page.getByRole("button", { name: "Preparando tu consulta…" })).toBeDisabled();
    await expect(T(page, "error-envio")).toContainText("No sabemos si llegó a guardarse", { timeout: 25_000 });
    await expect(cta(page)).toBeEnabled();
    await expect(page.getByLabel(/Nombre y apellido/)).toHaveValue("Ana Pérez");
    await expect(page.getByRole("radio", { name: /Retiro/ })).toBeChecked();
    expect(await cartItems(page)).toHaveLength(1);
    await expect(page).toHaveURL(/\/carrito$/);
  });

  test("se corta la respuesta DESPUÉS de guardar: al reintentar se recupera la misma consulta, no se crea otra", async ({ page }) => {
    await abrirPedido(page);
    await completar(page);
    const referencias: string[] = [];
    let intento = 0;
    await page.route(CONSULTAS, async (r) => {
      intento++;
      if (intento === 1) {
        const real = await r.fetch(); // el servidor SÍ la guarda…
        referencias.push((await real.json()).reference);
        await r.abort("connectionreset"); // …pero la respuesta nunca llega al navegador
      } else await r.continue();
    });
    await cta(page).click();
    await expect(T(page, "error-envio")).toContainText("No sabemos si llegó a guardarse");
    expect(referencias).toHaveLength(1);
    // La respuesta perdida llevaba la cookie de sesión del invitado: tampoco llegó al navegador (en Playwright la guarda `route.fetch`, así que se borra).
    await page.context().clearCookies();
    const segunda = page.waitForResponse((res) => res.url().endsWith("/api/inquiries"));
    await T(page, "reintentar-envio").click();
    const cuerpo = await (await segunda).json();
    expect(cuerpo, JSON.stringify(cuerpo).slice(0, 300)).toMatchObject({ replayed: true }); // el servidor reconoció la clave de idempotencia
    expect(cuerpo.reference).toBe(referencias[0]); // la misma consulta
    await expect(page).toHaveURL(new RegExp(`/carrito/consulta/${referencias[0]}`));
    expect(intento).toBe(2); // y nunca hubo un reintento automático
  });

  test("HTTP 500 y 429 al preparar la consulta: mensaje, botón libre y datos conservados; sin reintento automático", async ({ page }) => {
    await abrirPedido(page);
    await completar(page);
    let llamadas = 0;
    await page.route(CONSULTAS, (r) => { llamadas++; return fail(429, "rate_limited", "Hiciste muchas consultas seguidas. Esperá un rato e intentá de nuevo.")(r); });
    await cta(page).click();
    await expect(T(page, "error-envio")).toContainText("Hiciste muchas consultas seguidas");
    await page.waitForTimeout(1500);
    expect(llamadas).toBe(1);
    await page.unroute(CONSULTAS);
    await page.route(CONSULTAS, (r) => { llamadas++; return r.fulfill({ status: 502, contentType: "text/html", body: "<html>Bad gateway</html>" }); });
    await cta(page).click();
    await expect(T(page, "error-envio")).toContainText("de nuestro lado");
    await expect(cta(page)).toBeEnabled();
    expect(await cartItems(page)).toHaveLength(1);
  });

  test("doble toque en «Continuar»: una sola solicitud", async ({ page }) => {
    await abrirPedido(page);
    await completar(page);
    let llamadas = 0;
    await page.route(CONSULTAS, async (r) => { llamadas++; await new Promise((x) => setTimeout(x, 800)); await r.continue(); });
    await cta(page).dblclick();
    await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
    expect(llamadas).toBe(1);
  });
});

test.describe("panel lateral del carrito mientras se descarga su módulo", () => {
  /** Detiene (o hace fallar) los archivos de código que se piden DESPUÉS de cargar la página: entre ellos, el panel completo del carrito. */
  async function armarModulos(page: Page) {
    const iniciales = new Set<string>();
    let armado = false;
    page.on("request", (rq) => { if (!armado && rq.url().includes("/_next/static/chunks/")) iniciales.add(rq.url()); });
    await go(page, "/sellados");
    armado = true; // a partir de acá, todo archivo de código nuevo es «lazy»
    const estado = { modo: "retener" as "retener" | "fallar" | "pasar", pedidos: [] as string[], liberar: null as null | (() => void) };
    const puerta = new Promise<void>((r) => (estado.liberar = r));
    await page.route("**/_next/static/chunks/**", async (r) => {
      const url = r.request().url();
      if (iniciales.has(url) || estado.modo === "pasar") return r.continue();
      estado.pedidos.push(url);
      if (estado.modo === "fallar") return r.abort("failed");
      await puerta;
      await r.continue().catch(() => {});
    });
    return estado;
  }
  const agregar = (page: Page) => page.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" }).click();
  const marco = (page: Page) => T(page, "cart-drawer-cargando");

  test("se puede cerrar desde el primer momento: botón, Escape y fondo; el desplazamiento del fondo se libera", async ({ page }) => {
    const modulos = await armarModulos(page);
    await agregar(page);
    await expect(marco(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-cart-drawer", "open");
    await expect(marco(page).getByRole("heading", { name: /Tu carrito/ })).toBeFocused(); // el foco entra en el panel
    await T(page, "cart-drawer-cerrar").click();
    await expect(marco(page)).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-cart-drawer", /.*/);

    await page.locator("[data-cart-trigger]").click();
    await expect(marco(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(marco(page)).toHaveCount(0);
    await expect(page.locator("[data-cart-trigger]")).toBeFocused(); // el foco vuelve al botón del carrito

    // El fondo solo es tocable donde el panel no lo tapa: en un celular (< 416 px) el panel ocupa todo el ancho y se cierra con el botón o Escape.
    if (page.viewportSize()!.width > 450) {
      await page.locator("[data-cart-trigger]").click();
      await expect(marco(page)).toBeVisible();
      await T(page, "cart-drawer-fondo").click({ position: { x: 10, y: 200 } });
      await expect(marco(page)).toHaveCount(0);
    }
    await expect(page.locator("html")).not.toHaveAttribute("data-cart-drawer", /.*/);
    expect((await cartItems(page)).map((i) => i.quantity)).toEqual([1]); // el carrito no se tocó
    expect(modulos.pedidos.length).toBeGreaterThan(0); // el módulo sí se estaba pidiendo
  });

  test("Tab queda dentro del marco mientras carga", async ({ page }) => {
    await armarModulos(page);
    await agregar(page);
    await expect(marco(page)).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("[data-testid=cart-drawer-cargando]")))).toBe(true);
    }
  });

  test("cuando por fin llega el módulo, el marco abierto se convierte en el panel completo (con el foco en el panel)", async ({ page }) => {
    const modulos = await armarModulos(page);
    await agregar(page);
    await expect(marco(page)).toBeVisible();
    modulos.modo = "pasar";
    modulos.liberar?.();
    await expect(T(page, "cart-drawer")).toBeVisible();
    await expect(marco(page)).toHaveCount(0);
    await expect(T(page, "drawer-linea-storm-sobre")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-cart-drawer", "open");
    await page.keyboard.press("Escape");
    await expect(T(page, "cart-drawer")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-cart-drawer", /.*/);
  });

  test("cerrado el panel mientras carga, el módulo que llega después no lo reabre", async ({ page }) => {
    const modulos = await armarModulos(page);
    await agregar(page);
    await expect(marco(page)).toBeVisible();
    await T(page, "cart-drawer-cerrar").click();
    modulos.modo = "pasar";
    modulos.liberar?.();
    await page.waitForTimeout(800);
    await expect(T(page, "cart-drawer")).toHaveCount(0);
    await expect(marco(page)).toHaveCount(0);
  });

  test("falla la descarga del módulo: aviso con «Reintentar» y salida al pedido, sin recargas, y el carrito se conserva", async ({ page }) => {
    const modulos = await armarModulos(page);
    modulos.modo = "fallar";
    await agregar(page);
    const error = T(page, "cart-drawer-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(/no se perdió nada/i);
    await expect(T(page, "cart-drawer-ir-pedido")).toHaveAttribute("href", "/carrito");
    expect((await cartItems(page)).map((i) => i.productId)).toEqual(["storm-sobre"]);
    // Sin bucle: mientras no se toca nada, no se vuelve a pedir. Un intento pide los archivos del módulo (más de uno): se mide cuántos.
    const antes = modulos.pedidos.length;
    expect(antes).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    expect(modulos.pedidos.length).toBe(antes);
    // Reintento manual con la red todavía rota: un intento nuevo y el mismo aviso.
    await T(page, "cart-drawer-reintentar").click();
    await expect(error).toBeVisible();
    await page.waitForTimeout(500);
    expect(modulos.pedidos.length).toBe(antes * 2); // exactamente un intento más, el que se pidió con el botón
    // Vuelve la red: «Reintentar» abre el panel de verdad.
    modulos.modo = "pasar";
    await T(page, "cart-drawer-reintentar").click();
    await expect(T(page, "cart-drawer")).toBeVisible();
    await expect(T(page, "drawer-linea-storm-sobre")).toBeVisible();
    expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1); // nunca se recargó la página
  });

  test("Escape apenas aparece el panel (justo en el relevo del marco de carga al panel completo): el foco vuelve siempre al botón que se tocó", async ({ page }) => {
    test.setTimeout(90_000);
    for (let i = 0; i < 10; i++) {
      await go(page, "/sellados"); // cada vuelta es una primera apertura: el módulo del panel se descarga de nuevo
      const add = page.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" });
      await add.click();
      await expect(T(page, "cart-drawer")).toBeVisible();
      await page.keyboard.press("Escape"); // sin esperar a que el panel termine de montarse
      await expect(T(page, "cart-drawer")).toHaveCount(0);
      // Safari/WebKit no da foco a un botón al tocarlo con el mouse: no hay elemento de origen y el foco vuelve al ícono del carrito (respaldo previsto).
      if (test.info().project.name === "resil-webkit") await expect(page.locator("[data-cart-trigger]"), `vuelta ${i + 1}`).toBeFocused();
      else await expect(add, `vuelta ${i + 1}`).toBeFocused();
      await page.evaluate((k) => localStorage.removeItem(k), KEY);
    }
  });

  test("falla la descarga y se cierra con Escape; al volver a abrir se vuelve a intentar", async ({ page }) => {
    const modulos = await armarModulos(page);
    modulos.modo = "fallar";
    await agregar(page);
    await expect(T(page, "cart-drawer-error")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(T(page, "cart-drawer-cargando")).toHaveCount(0);
    modulos.modo = "pasar";
    await page.locator("[data-cart-trigger]").click();
    await expect(T(page, "cart-drawer")).toBeVisible();
  });
});

/** PostgreSQL descartable de las pruebas (el mismo de scripts/pg-test-server.ts): permite quitar y devolver la base del servidor «caido» sin tocar nada real. */
const adminPg = () => postgres(`postgres://postgres:postgres@127.0.0.1:${process.env.PG_TEST_PORT || 54398}/postgres`, { max: 1, onnotice: () => undefined });

test.describe("pantalla de error de página", () => {
  test("con la base de datos caída: pantalla propia (no la genérica), con «Reintentar» y «Volver al catálogo»; no se muestra ningún precio", async ({ page }) => {
    const pg = adminPg();
    await pg.unsafe("drop database if exists e2e_caido with (force)"); // la base «se cae» (también corta las conexiones abiertas del servidor)
    await pg.end({ timeout: 2 });
    await page.goto("http://localhost:3107/sellados");
    const pantalla = T(page, "pantalla-error");
    await expect(pantalla).toBeVisible();
    await expect(pantalla.getByRole("heading", { level: 1 })).toHaveText("No pudimos cargar esta página.");
    await expect(pantalla.getByRole("button", { name: "Reintentar" })).toBeVisible();
    await expect(pantalla.getByRole("link", { name: "Volver al catálogo" })).toHaveAttribute("href", "/sellados");
    await expect(page.locator("main")).not.toContainText("$"); // nada de importes inventados
    await expect(page.getByRole("link", { name: /Ver todos|Inicio|Vasconcelo/ }).first()).toBeVisible(); // el encabezado del sitio sigue
    await pantalla.getByRole("button", { name: "Reintentar" }).click(); // sigue caído: vuelve a mostrar la pantalla, sin romper
    await expect(pantalla).toBeVisible();
  });

  test("base caída: muchas solicitudes seguidas responden un error controlado en pocos segundos (sin quedar colgadas) y, al volver la base, la aplicación se recupera sin reiniciarse", async ({ request }) => {
    test.setTimeout(120_000);
    const pg = adminPg();
    await pg.unsafe("drop database if exists e2e_caido with (force)");
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) {
      const t = Date.now();
      const r = await request.get("http://localhost:3107/sellados", { timeout: 20_000 }); // antes: la 5.ª o 6.ª solicitud esperaba 20 s o más cada una
      expect(r.status()).toBeGreaterThanOrEqual(500);
      expect(Date.now() - t).toBeLessThan(12_000);
    }
    expect((await request.get("http://localhost:3107/api/health", { timeout: 20_000 })).status()).toBe(503);
    expect(Date.now() - t0).toBeLessThan(60_000);
    expect((await request.get("http://localhost:3107/como-comprar")).status()).toBe(200); // lo que no usa la base sigue respondiendo
    // La base vuelve (copia de la plantilla migrada): la misma instancia de la aplicación responde sin reiniciar.
    await pg.unsafe("create database e2e_caido template tienda_plantilla");
    await pg.end({ timeout: 2 });
    await expect.poll(async () => (await request.get("http://localhost:3107/api/health", { timeout: 20_000 })).status(), { timeout: 30_000, intervals: [500] }).toBe(200);
    expect((await request.get("http://localhost:3107/sellados", { timeout: 20_000 })).status()).toBe(200);
  });
});

/** Servidor «layout» (:3108): el mismo build, con el gancho de pruebas que hace fallar el diseño raíz mientras exista el archivo de bandera. */
const FLAG = path.resolve(`.local/data/e2e-${stamp}-layout.flag`);
const carritoGuardado = { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000, mode: "buy", title: "Storm Emeralda · Sobre" }], delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null };

test.describe("global-error (falla del diseño raíz) y pestañas con una versión vieja", () => {
  test.afterEach(() => fs.rmSync(FLAG, { force: true }));

  test("global-error: pantalla propia sin información interna, el carrito se conserva, «Reintentar» recupera sin reiniciar el servidor", async ({ page }) => {
    fs.mkdirSync(path.dirname(FLAG), { recursive: true });
    await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k as string)) localStorage.setItem(k as string, JSON.stringify(v)); }, [KEY, carritoGuardado]);
    fs.writeFileSync(FLAG, "1");
    const res = await page.goto("http://localhost:3108/sellados");
    expect(res?.status()).toBeGreaterThanOrEqual(500);
    const pantalla = T(page, "pantalla-error");
    await expect(pantalla).toBeVisible();
    await expect(pantalla.getByRole("heading", { level: 1 })).toHaveText("No pudimos cargar esta página.");
    await expect(page.locator("header")).toHaveCount(0); // es el documento propio de global-error: sin el diseño del sitio
    // Sin información interna: ni el texto del error, ni rutas, ni trazas, en la pantalla ni en el HTML recibido.
    const html = await (await page.request.get("http://localhost:3108/sellados")).text();
    for (const texto of [await page.locator("body").innerText(), html]) {
      expect(texto).not.toMatch(/Fallo simulado|detalle interno|node_modules|\.next-e2e|at \w+ \(|stack/i);
    }
    await expect(pantalla).toContainText("Código para soporte"); // solo el código opaco (digest)
    await page.screenshot({ path: `docs/capturas/resiliencia/10-global-error-${test.info().project.name}.png` });
    await expect(pantalla.getByRole("link", { name: "Volver al catálogo" })).toHaveAttribute("href", "/sellados");
    // El carrito está intacto.
    expect((await cartItems(page)).map((i) => [i.productId, i.quantity])).toEqual([["storm-sobre", 2]]);
    // «Reintentar» con el fallo todavía presente: vuelve a mostrar la pantalla, sin romper.
    await pantalla.getByRole("button", { name: "Reintentar" }).click();
    await expect(pantalla).toBeVisible();
    // Se resuelve el fallo (sin reiniciar nada) y «Reintentar» trae la página.
    fs.rmSync(FLAG, { force: true });
    await pantalla.getByRole("button", { name: "Reintentar" }).dispatchEvent("click"); // la página se reemplaza al instante: no se espera «estabilidad» del botón
    await expect(page.getByRole("heading", { level: 1, name: /Explorá tu próxima apertura/ })).toBeVisible({ timeout: 15_000 });
    await expect(pantalla).toHaveCount(0);
    await expect(T(page, "cart-count")).toHaveText("2"); // el carrito, ahora en el encabezado
  });

  test("pestaña abierta antes de un despliegue: el módulo del carrito viejo ya no existe → «Actualizar la página» trae la versión nueva, una sola vez y sin perder el carrito", async ({ page }) => {
    const iniciales = new Set<string>();
    let armado = false;
    page.on("request", (rq) => { if (!armado && rq.url().includes("/_next/static/chunks/")) iniciales.add(rq.url()); });
    await go(page, "/sellados");
    armado = true;
    // «Despliegue»: los archivos de código que esta pestaña todavía no tenía descargados ahora responden 404 (el sitio nuevo ya no los tiene con ese nombre).
    await page.route("**/_next/static/chunks/**", (r) => (iniciales.has(r.request().url()) ? r.continue() : r.fulfill({ status: 404, contentType: "text/plain", body: "Not found" })));
    await page.getByRole("button", { name: "Agregar Storm Emeralda · Sobre al carrito" }).click();
    await expect(T(page, "cart-drawer-error")).toBeVisible();
    await expect(T(page, "cart-drawer-actualizar")).toBeVisible();
    await T(page, "cart-drawer-reintentar").click(); // reintentar no alcanza: el archivo viejo no vuelve
    await expect(T(page, "cart-drawer-error")).toBeVisible();
    // La versión nueva ya está sirviéndose: se quita el 404 y la persona actualiza.
    await page.unroute("**/_next/static/chunks/**");
    let navegaciones = 0; // documentos pedidos (los cambios de URL internos de Next no cuentan)
    page.on("request", (rq) => { if (rq.resourceType() === "document") navegaciones++; });
    await Promise.all([page.waitForLoadState("load"), T(page, "cart-drawer-actualizar").click()]);
    await page.locator("html[data-hydrated='true']").waitFor();
    await page.waitForTimeout(1500);
    expect(navegaciones).toBe(1); // una sola recarga: nunca se recarga sola ni en bucle
    expect((await cartItems(page)).map((i) => [i.productId, i.quantity])).toEqual([["storm-sobre", 1]]);
    await T(page, "cart-count").waitFor();
    await page.locator("[data-cart-trigger]").click();
    await expect(T(page, "cart-drawer")).toBeVisible();
  });

  test("pestaña vieja: al navegar a una página cuyo código ya no existe se muestra «La tienda se actualizó»; «Actualizar la página» la recupera con una sola recarga y el carrito sigue", async ({ page }) => {
    const iniciales = new Set<string>();
    let armado = false;
    page.on("request", (rq) => { if (!armado && rq.url().includes("/_next/static/")) iniciales.add(rq.url()); });
    await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k as string)) localStorage.setItem(k as string, JSON.stringify(v)); }, [KEY, carritoGuardado]);
    await go(page, "/");
    armado = true;
    await page.route("**/_next/static/**", (r) => (iniciales.has(r.request().url()) ? r.continue() : r.fulfill({ status: 404, contentType: "text/plain", body: "Not found" })));
    await page.evaluate(() => (document.querySelector("a[href='/sellados']") as HTMLElement).click()); // navegación interna de Next (en celular el menú está plegado)
    const pantalla = page.locator("[data-testid=pantalla-error]");
    await expect(pantalla).toHaveAttribute("data-tipo", "version-vieja");
    await expect(pantalla.getByRole("heading", { level: 1 })).toHaveText("La tienda se actualizó.");
    await expect(pantalla.getByRole("button", { name: "Actualizar la página" })).toBeVisible();
    await expect(pantalla).not.toContainText(/chunk|module|undefined|Error:/i); // sin detalles internos
    await page.screenshot({ path: `docs/capturas/resiliencia/11-version-vieja-${test.info().project.name}.png` });
    expect((await cartItems(page)).map((i) => i.quantity)).toEqual([2]);
    // Con la versión nueva ya disponible, la persona actualiza: una sola recarga y la página pedida.
    await page.unroute("**/_next/static/**");
    let documentos = 0;
    page.on("request", (rq) => { if (rq.resourceType() === "document") documentos++; });
    await pantalla.getByRole("button", { name: "Actualizar la página" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Explorá tu próxima apertura/ })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    expect(documentos).toBe(1);
    await expect(T(page, "cart-count")).toHaveText("2");
  });
});
