import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor «admin» (:3103, catálogo de prueba, ADMIN_EMAIL=dueno-e2e@example.com, sin red para el dólar) y servidor «real» (:3102, sin ADMIN_EMAIL: panel cerrado).
// Las cotizaciones de estas pruebas son SINTÉTICAS (1.234 y 1.235 pesos por dólar): no son cotizaciones vigentes.
const stamp = process.env.E2E_STAMP!;
const ADMIN = "http://localhost:3103";
const CERRADO = "http://localhost:3102";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const mailDir = (tag: string) => path.resolve(`.local/data/e2e-${stamp}-${tag}-mail`);

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const newEmail = (tag: string) => `${tag}-${uid()}@example.com`.toLowerCase();
// Cada prueba usa su propia IP de origen: los límites de uso son reales y no deben mezclarse entre pruebas.
const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});

async function waitForVerificationLink(tag: string, to: string): Promise<string> {
  const dir = mailDir(tag);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(dir) ? fs.readdirSync(dir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { to: string; kind: string; link: string }).filter((m) => m.to === to && m.kind === "verificacion") : [];
    if (found.length) return found[found.length - 1].link;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo de confirmación para ${to}`);
}

/** Alta + confirmación con el enlace del correo local; deja la sesión iniciada en `page`. */
async function signUp(page: Page, origin: string, tag: string, name: string, email: string) {
  const res = await page.request.post(`${origin}/api/auth/sign-up/email`, { data: { name, email, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: origin } });
  expect(res.ok()).toBe(true);
  await go(page, await waitForVerificationLink(tag, email));
  await expect(page.getByTestId("verificacion-ok")).toBeVisible();
}

const validate = async (request: APIRequestContext, productId: string, quantity: number, expectedPriceMinor: number) => {
  const r = await request.post(`${ADMIN}/api/cart/validate`, { data: { items: [{ productId, quantity, expectedPriceMinor }] }, headers: { Origin: ADMIN } });
  expect(r.ok()).toBe(true);
  return (await r.json()).lines[0] as { status: string; unitPriceMinor: number | null; unitPriceUsdMinor: number | null; maxQuantity: number };
};
const row = (page: Page, id: string) => page.getByTestId(`admin-fila-${id}`);
/** Edición rápida de la lista: precio base en USD y stock. */
async function rapido(page: Page, id: string, v: { usd?: string; stock?: string }) {
  const r = row(page, id);
  if (v.usd !== undefined) await r.getByTestId("input-usd").fill(v.usd);
  if (v.stock !== undefined) await r.getByTestId("input-stock").fill(v.stock);
  await r.getByTestId("guardar-fila").click();
}
const png = (w = 640, h = 480) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 130, b: 90 } } }).png().toBuffer();
const patch = (page: Page, id: string, data: Record<string, unknown>, origin = ADMIN) => page.request.patch(`${ADMIN}/api/admin/products/${id}`, { data, headers: { Origin: origin } });
const setRate = async (page: Page, rate: string) => {
  await go(page, "/admin/cotizacion");
  await page.getByTestId("fx-manual-input").fill(rate);
  await page.getByTestId("fx-guardar-manual").click();
  await expect(page.getByTestId("fx-mensaje")).toContainText("Cotización manual guardada");
};

test.describe.configure({ mode: "serial" });

test.describe("acceso: solo el dueño configurado", () => {
  test("un invitado no entra ni puede modificar nada (páginas, productos, fotos, cotización)", async ({ page, request }) => {
    for (const p of ["/admin", "/admin/historial", "/admin/cotizacion", "/admin/productos/storm-sobre"]) {
      await page.goto(p);
      await expect(page).toHaveURL(new RegExp("/cuenta/ingresar\\?next="));
      await expect(page.getByTestId("admin-resumen")).toHaveCount(0);
    }
    const body = { priceUsdMinor: 1, stock: 1, maxPerOrder: null, visible: true, expectedVersion: 0 };
    expect((await request.patch(`${ADMIN}/api/admin/products/storm-sobre`, { data: body, headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.delete(`${ADMIN}/api/admin/products/storm-sobre?version=0`, { headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.put(`${ADMIN}/api/admin/products/storm-sobre/gallery`, { data: { items: [{ src: "/images/x.webp", alt: "texto alt" }], expectedVersion: 0 }, headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.delete(`${ADMIN}/api/admin/products/storm-sobre/gallery?version=0`, { headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.post(`${ADMIN}/api/admin/media`, { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: await png() } }, headers: { Origin: ADMIN } })).status()).toBe(401);
    for (const data of [{ action: "refresh" }, { action: "auto" }, { action: "manual", rate: "1500" }]) {
      expect((await request.post(`${ADMIN}/api/admin/fx`, { data, headers: { Origin: ADMIN } })).status(), JSON.stringify(data)).toBe(401);
    }
    expect((await validate(request, "storm-sobre", 1, 950000)).status).toBe("ok"); // nada cambió
  });

  test("otra cuenta (verificada) recibe 404 en las páginas y 403 en las operaciones; los datos no cambian", async ({ page, request }) => {
    await signUp(page, ADMIN, "admin", "Otra Persona", newEmail("otra"));
    for (const p of ["/admin", "/admin/historial", "/admin/cotizacion", "/admin/productos/storm-sobre"]) expect((await page.goto(p))!.status(), p).toBe(404);
    const body = { priceUsdMinor: 1, stock: 1, maxPerOrder: null, visible: true, expectedVersion: 0 };
    expect((await patch(page, "storm-sobre", body)).status()).toBe(403);
    expect((await page.request.delete(`${ADMIN}/api/admin/products/storm-sobre?version=0`, { headers: { Origin: ADMIN } })).status()).toBe(403);
    expect((await page.request.put(`${ADMIN}/api/admin/products/storm-sobre/gallery`, { data: { items: [{ src: "/images/x.webp", alt: "texto alt" }], expectedVersion: 0 }, headers: { Origin: ADMIN } })).status()).toBe(403);
    expect((await page.request.post(`${ADMIN}/api/admin/media`, { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: await png() } }, headers: { Origin: ADMIN } })).status()).toBe(403);
    expect((await page.request.post(`${ADMIN}/api/admin/fx`, { data: { action: "manual", rate: "9999" }, headers: { Origin: ADMIN } })).status()).toBe(403);
    // intentar «declararse» administrador con encabezados, cookies o campos propios no sirve
    const trick = await page.request.patch(`${ADMIN}/api/admin/products/storm-sobre`, { data: { ...body, admin: true, role: "admin", email: OWNER }, headers: { Origin: ADMIN, "x-admin": "1", "x-user-email": OWNER } });
    expect(trick.status()).toBe(403);
    expect(await validate(request, "storm-sobre", 1, 950000)).toMatchObject({ status: "ok", unitPriceMinor: 950000 });
  });

  test("sin ADMIN_EMAIL el panel queda cerrado, incluso para quien se registre primero o use el correo del dueño", async ({ browser, ip }) => {
    const ctx = await browser.newContext({ baseURL: CERRADO, extraHTTPHeaders: { "x-forwarded-for": ip } });
    const page = await ctx.newPage();
    await signUp(page, CERRADO, "real", "Primer Usuario", newEmail("primero"));
    for (const p of ["/admin", "/admin/historial", "/admin/cotizacion"]) expect((await page.goto(p))!.status()).toBe(404);
    expect((await page.request.patch(`${CERRADO}/api/admin/products/storm-sobre`, { data: { priceUsdMinor: 100, stock: 1, maxPerOrder: null, visible: true, expectedVersion: 0 }, headers: { Origin: CERRADO } })).status()).toBe(403);
    expect((await page.request.post(`${CERRADO}/api/admin/fx`, { data: { action: "manual", rate: "1500" }, headers: { Origin: CERRADO } })).status()).toBe(403);
    await ctx.close();
  });

  test("el endpoint de actualización programada no existe sin CRON_SECRET y no sirve fotos ajenas ni nombres inventados", async ({ request }) => {
    expect((await request.post(`${ADMIN}/api/fx/refresh`, { headers: { authorization: "Bearer lo-que-sea" } })).status()).toBe(404);
    for (const n of ["../../.env", "x.webp", "0".repeat(24) + ".png", "0".repeat(24) + ".webp"]) expect((await request.get(`${ADMIN}/images/uploads/${encodeURIComponent(n)}`)).status(), n).toBe(404);
  });
});

test.describe("el dueño administra precios, stock, fotos y cotización", () => {
  let owner: Page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: ADMIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    owner = await ctx.newPage();
    await signUp(owner, ADMIN, "admin", "Dueño de la Tienda", OWNER);
  });
  test.afterAll(async () => {
    await owner.context().close();
  });

  test("ve la lista con idioma, USD, pesos, stock y estado; busca y filtra", async () => {
    await go(owner, "/admin");
    await expect(owner.getByRole("heading", { level: 1 })).toHaveText("Precios y stock");
    await expect(owner.getByTestId("admin-cantidad")).toHaveText("8 productos");
    await expect(owner.getByTestId("cuenta-available")).toHaveText("7");
    await expect(owner.getByTestId("cuenta-soldout")).toHaveText("1"); // bundle con stock 0
    await expect(owner.getByTestId("admin-fx-resumen")).toContainText("No hay una cotización utilizable"); // sin red y sin valor manual todavía
    await expect(row(owner, "parcial-bundle").getByTestId("estado")).toHaveText("Sin stock");
    // los productos de demostración conservan su precio ARS fijo; sin USD cargado el campo está vacío
    await expect(row(owner, "storm-sobre").getByTestId("input-usd")).toHaveValue("");
    await expect(row(owner, "storm-sobre").getByTestId("ars")).toContainText("$");
    await owner.getByLabel("Buscar por nombre, colección o SKU").fill("pack MIXTO");
    await owner.getByRole("button", { name: "Buscar" }).click();
    await expect(owner.getByTestId("admin-cantidad")).toHaveText("1 de 8 productos");
    await expect(row(owner, "ejemplo-pack-mixto")).toBeVisible();
    await go(owner, "/admin?q=DEMO-STORM-CAJA");
    await expect(owner.getByTestId("admin-cantidad")).toHaveText("1 de 8 productos");
    await go(owner, "/admin?q=storm");
    await expect(owner.getByTestId("admin-cantidad")).toHaveText("3 de 8 productos");
    await go(owner, "/admin?estado=soldout");
    await expect(owner.getByTestId("admin-cantidad")).toHaveText("1 de 8 productos");
    await go(owner, "/admin?idioma=zh");
    await expect(owner.getByText("Ningún producto coincide")).toBeVisible();
    await go(owner, "/admin?q=zzzz");
    await expect(owner.getByText("Ningún producto coincide")).toBeVisible();
  });

  test("cotización: sin valor utilizable los precios en pesos quedan pendientes; un valor manual es explícito, persistente y visible", async ({ browser, request }) => {
    await go(owner, "/admin/cotizacion");
    await expect(owner.getByTestId("fx-estado")).toHaveText("Sin cotización utilizable");
    await expect(owner.getByTestId("fx-valor")).toHaveText("Sin cotización");
    await expect(owner.getByTestId("fx-consultar")).toBeDisabled(); // consultas de red desactivadas en este entorno
    await expect(owner.getByTestId("fx-previa")).toContainText("Todavía no hay productos con precio en USD");
    // valores inválidos
    await owner.getByTestId("fx-manual-input").fill("abc");
    await expect(owner.getByTestId("fx-guardar-manual")).toBeDisabled();
    for (const bad of ["0", "-5"]) {
      const res = await owner.request.post(`${ADMIN}/api/admin/fx`, { data: { action: "manual", rate: bad }, headers: { Origin: ADMIN } });
      expect(res.status(), bad).toBe(400);
    }
    expect((await owner.request.post(`${ADMIN}/api/admin/fx`, { data: { action: "manual", rate: "1234" }, headers: { Origin: "https://otro.example" } })).status()).toBe(403);
    // un precio en USD sin cotización: el USD se guarda y los pesos quedan pendientes (nunca $0)
    await go(owner, "/admin");
    await rapido(owner, "storm-sobre", { usd: "10" });
    await expect(row(owner, "storm-sobre").getByTestId("mensaje")).toContainText("Guardado");
    await go(owner, "/admin?q=storm-sobre");
    await expect(row(owner, "storm-sobre").getByTestId("estado")).toHaveText("Pendiente");
    expect(await validate(request, "storm-sobre", 1, 950000)).toMatchObject({ status: "pending_commercial", unitPriceMinor: null });
    const v = await (await browser.newContext({ baseURL: ADMIN })).newPage();
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await expect(v.getByTestId("precio-usd").first()).toContainText("USD 10,00");
    await expect(v.locator("main")).not.toContainText("$0");
    // valor manual
    await setRate(owner, "1234");
    await expect(owner.getByTestId("fx-estado")).toHaveText("Manual · fijada por la tienda");
    await expect(owner.getByTestId("fx-valor")).toHaveText("$ 1.234,00");
    await expect(owner.getByTestId("fx-manual")).toContainText(OWNER);
    await owner.reload();
    await expect(owner.getByTestId("fx-valor")).toHaveText("$ 1.234,00"); // persiste
    await expect(owner.getByTestId("fx-volver-auto")).toBeVisible();
    // ahora la ficha pública muestra pesos principal y USD debajo, con la fuente a un toque
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.getByTestId("precio").first()).toHaveText("$ 12.300"); // USD 10 × 1.234 = $ 12.340 → $ 12.300
    await expect(v.getByTestId("precio-usd").first()).toHaveText("USD 10,00 · dólar blue venta");
    await v.getByTestId("fx-note").first().locator("summary").click();
    await expect(v.getByTestId("fx-note").first()).toContainText("$ 1.234,00");
    await expect(v.getByTestId("fx-note").first()).toContainText("servicio de terceros, no una cotización oficial del BCRA");
    await v.context().close();
    // la vista previa muestra el efecto de otra cotización sin guardarla
    await go(owner, "/admin/cotizacion");
    await owner.getByTestId("fx-candidata").fill("1235");
    await expect(owner.getByTestId("fx-previa")).toContainText("$ 12.400"); // 12.350 → mitad hacia arriba
    await expect(owner.getByTestId("fx-valor")).toHaveText("$ 1.234,00");
  });

  test("edición rápida: USD y stock se ven convertidos en catálogo, ficha y carrito; valida lo que se escribe; avisa si hay cambios sin guardar", async ({ browser, request }) => {
    await go(owner, "/admin?q=storm-sobre");
    const r = row(owner, "storm-sobre");
    await expect(r.getByTestId("input-usd")).toHaveValue("10,00");
    await expect(r.getByTestId("ars")).toHaveText("$ 12.300");
    // vista previa en vivo y aviso de cambios sin guardar
    await r.getByTestId("input-usd").fill("12,5");
    await expect(r.getByTestId("ars")).toContainText("→ $ 15.400"); // 12,50 × 1.234 = 15.425 → 15.400
    await expect(r).toHaveAttribute("data-dirty", "true");
    await expect(owner.getByTestId("guardar-todo")).toContainText("1 cambio");
    let dialogo = "";
    owner.once("dialog", (d) => { dialogo = d.message(); void d.dismiss(); });
    await owner.getByRole("link", { name: "Cotización", exact: true }).click();
    expect(dialogo).toContain("cambios sin guardar");
    await expect(owner).toHaveURL(/\/admin\?q=storm-sobre/);
    // validaciones
    await rapido(owner, "storm-sobre", { usd: "abc" });
    await expect(r.getByTestId("mensaje")).toContainText("Precio en dólares no válido");
    await rapido(owner, "storm-sobre", { usd: "12,5", stock: "-3" });
    await expect(r.getByTestId("mensaje")).toContainText("stock debe ser un número entero");
    await rapido(owner, "storm-sobre", { usd: "0", stock: "5" });
    await expect(r.getByTestId("mensaje")).toContainText("Precio en dólares no válido");
    const bad = [{ priceUsdMinor: 12.5 }, { stock: 1.5 }, { stock: -1 }, { priceUsdMinor: "100" }, { maxPerOrder: 0 }, { visible: "si" }, { expectedVersion: -1 }, { title: "ab" }, { description: "corta" }, { priceUsdMinor: 0 }];
    for (const p of bad) expect((await patch(owner, "storm-sobre", { expectedVersion: 0, ...p })).status(), JSON.stringify(p)).toBe(400);
    expect((await patch(owner, "no-existe", { priceUsdMinor: 100, expectedVersion: 0 })).status()).toBe(404);
    expect((await patch(owner, "storm-sobre", { priceUsdMinor: 100, expectedVersion: 0 }, "https://otro-sitio.example")).status()).toBe(403);
    // guardar de verdad: USD 12,50 y stock 7
    await rapido(owner, "storm-sobre", { usd: "12,5", stock: "7" });
    await expect(r.getByTestId("mensaje")).toContainText("Guardado");
    await expect(r).toHaveAttribute("data-dirty", "false");
    await go(owner, "/admin?q=storm-sobre");
    await expect(r.getByTestId("input-usd")).toHaveValue("12,50");
    await expect(r.getByTestId("input-stock")).toHaveValue("7");
    await expect(r.getByTestId("ars")).toHaveText("$ 15.400");
    await expect(r.getByTestId("estado")).toHaveText("Disponible");
    const visitor = await browser.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.getByTestId("precio").first()).toHaveText("$ 15.400");
    await expect(v.getByTestId("precio-usd").first()).toContainText("USD 12,50");
    await go(v, "/sellados?q=storm");
    const card = v.locator("article").filter({ hasText: "Storm Emeralda · Sobre" }).first();
    await expect(card.getByTestId("precio")).toHaveText("$ 15.400");
    await expect(card.getByTestId("precio-usd")).toContainText("USD 12,50");
    // filtros y orden por precio usan los pesos convertidos
    await go(v, "/sellados?pmin=15000&pmax=15500");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Sobre" })).toHaveCount(1);
    await go(v, "/sellados?pmin=15500");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Sobre" })).toHaveCount(0);
    expect(await validate(request, "storm-sobre", 1, 950000)).toMatchObject({ status: "price_changed", unitPriceMinor: 1_540_000, unitPriceUsdMinor: 1250, maxQuantity: 7 });
    expect(await validate(request, "storm-sobre", 2, 1_540_000)).toMatchObject({ status: "ok" });
    await visitor.close();
  });

  test("carrito y consulta: el cambio de cotización se avisa antes de confirmar y la consulta guardada conserva su cotización", async ({ browser, request }) => {
    const guest = await browser.newContext({ baseURL: ADMIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const g = await guest.newPage();
    await go(g, "/carrito");
    const mk = (price: number, key: string, accept = false) => g.request.post(`${ADMIN}/api/inquiries`, {
      data: { items: [{ productId: "storm-sobre", quantity: 2, expectedPriceMinor: price }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: key, ...(accept ? { acceptPriceChanges: true } : {}) },
      headers: { Origin: ADMIN },
    });
    const first = await mk(1_540_000, `admin-e2e-${uid()}-aaaaaaaa`);
    expect(first.status()).toBe(201);
    const ref = (await first.json()).reference as string;
    await go(g, `/carrito/consulta/${ref}`);
    await expect(g.locator("main")).toContainText("$ 30.800"); // 2 × $ 15.400
    await expect(g.getByTestId("fx-snapshot")).toContainText("$ 1.234,00");
    await expect(g.locator("main")).toContainText("USD 12,50 c/u");
    expect(await first.json()).toMatchObject({ reference: ref });

    // el dólar sube (valor sintético: 1.300). Un carrito armado con el precio anterior se avisa ANTES de confirmar
    await setRate(owner, "1300");
    expect(await validate(request, "storm-sobre", 2, 1_540_000)).toMatchObject({ status: "price_changed", unitPriceMinor: 1_630_000 }); // 12,50 × 1.300 = 16.250 → mitad hacia arriba → $ 16.300
    const sinAceptar = await mk(1_540_000, `admin-e2e-${uid()}-bbbbbbbb`);
    expect(sinAceptar.status()).toBe(409);
    expect((await sinAceptar.json()).error.code).toBe("price_changed");
    const aceptada = await mk(1_540_000, `admin-e2e-${uid()}-cccccccc`, true);
    expect(aceptada.status()).toBe(201);
    const ref2 = (await aceptada.json()).reference as string;
    await go(g, `/carrito/consulta/${ref2}`);
    await expect(g.locator("main")).toContainText("$ 32.600");
    await expect(g.getByTestId("fx-snapshot")).toContainText("$ 1.300,00");
    // la consulta anterior NO cambió: mismo importe y misma cotización
    await go(g, `/carrito/consulta/${ref}`);
    await expect(g.locator("main")).toContainText("$ 30.800");
    await expect(g.locator("main")).not.toContainText("$ 32.600");
    await expect(g.getByTestId("fx-snapshot")).toContainText("$ 1.234,00");
    // abrir/preparar la consulta no descuenta stock
    await go(owner, "/admin?q=storm-sobre");
    await expect(row(owner, "storm-sobre").getByTestId("input-stock")).toHaveValue("7");
    await guest.close();
  });

  test("ficha del producto: título, descripción, estados de stock y publicación; la vista previa es solo del administrador", async ({ browser }) => {
    const visitor = await browser.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    await go(owner, "/admin/productos/storm-sobre");
    await expect(owner.getByTestId("editor-titulo")).toContainText("Storm Emeralda · Sobre");
    // validación local
    await owner.locator("#ed-title").fill("ab");
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByText("El título debe tener al menos 3 caracteres.")).toBeVisible();
    await owner.locator("#ed-title").fill("Storm Emeralda · Sobre (edición del dueño)");
    await owner.locator("#ed-desc").fill("Descripción propia escrita por el dueño desde el panel.");
    await expect(owner.getByTestId("sin-guardar")).toBeVisible();
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.getByRole("heading", { level: 1 })).toHaveText("Storm Emeralda · Sobre (edición del dueño)");
    await expect(v.locator("main")).toContainText("Descripción propia escrita por el dueño desde el panel.");
    await expect(v.getByTestId("precio").first()).toHaveText("$ 16.300"); // el título editado no pierde precio, idioma ni colección
    await expect(v.locator("main")).toContainText("Storm Emeralda");

    // disponible por encargo
    await go(owner, "/admin/productos/storm-sobre");
    await owner.getByRole("radio", { name: "Disponible por encargo" }).check();
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    await expect(owner.getByTestId("estado")).toHaveText("Por encargo");
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.getByTestId("disponibilidad").first()).toHaveText("Disponible por encargo");
    await expect(v.getByTestId("pendiente-comercial")).toBeVisible(); // se consulta, no se compra
    // cantidad desconocida (pendiente) ≠ cantidad cero (agotado)
    await go(owner, "/admin/productos/storm-sobre");
    await owner.getByRole("radio", { name: "Cantidad desconocida (pendiente)" }).check();
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    await expect(owner.getByTestId("estado")).toHaveText("Pendiente");
    await owner.getByRole("radio", { name: "Cantidad en stock" }).check();
    await owner.locator("input[name=stock]").fill("0");
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    await expect(owner.getByTestId("estado")).toHaveText("Sin stock");
    await owner.locator("input[name=stock]").fill("7");
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("estado")).toHaveText("Disponible");

    // ocultar: 404 para el público (también con ?preview=1), vista previa solo para el administrador
    await owner.getByLabel("Publicada (visible en la tienda)").uncheck();
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    expect((await v.goto("/productos/storm-emeralda-sobre"))!.status()).toBe(404);
    expect((await v.goto("/productos/storm-emeralda-sobre?preview=1"))!.status()).toBe(404);
    const [previa] = await Promise.all([owner.context().waitForEvent("page"), owner.getByTestId("vista-previa").click()]);
    await previa.waitForLoadState();
    await expect(previa.getByTestId("aviso-vista-previa")).toContainText("NO está publicada");
    await expect(previa.getByRole("heading", { level: 1 })).toHaveText("Storm Emeralda · Sobre (edición del dueño)");
    await previa.close();
    await owner.getByLabel("Publicada (visible en la tienda)").check();
    await owner.getByTestId("guardar-ficha").click();
    await expect(owner.getByTestId("mensaje")).toContainText("Guardado");
    expect((await v.goto("/productos/storm-emeralda-sobre"))!.status()).toBe(200);
    await visitor.close();
  });

  test("fotos: sube (y rechaza lo inválido), elige portada, reordena, cambia el texto alternativo, retira y restablece", async ({ browser, request }) => {
    await go(owner, "/admin/productos/storm-sobre");
    const lista = owner.getByTestId("galeria-lista");
    const antes = await lista.locator("> li").count();
    expect(antes).toBeGreaterThanOrEqual(1);
    // archivo que no es una imagen (con extensión de imagen): se rechaza y no se agrega nada
    await owner.getByTestId("subir-foto").setInputFiles({ name: "falsa.png", mimeType: "image/png", buffer: Buffer.from("no soy una imagen, soy texto") });
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("no es una imagen");
    // una imagen demasiado chica también
    await owner.getByTestId("subir-foto").setInputFiles({ name: "chica.png", mimeType: "image/png", buffer: await png(100, 100) });
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("muy chica");
    await expect(lista.locator("> li")).toHaveCount(antes);
    // una válida
    await owner.getByTestId("subir-foto").setInputFiles({ name: "mi-stock.png", mimeType: "image/png", buffer: await png(900, 700) });
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("1 foto subida");
    await expect(lista.locator("> li")).toHaveCount(antes + 1);
    // portada + texto alternativo
    await owner.getByTestId(`foto-${antes}`).getByTestId("hacer-portada").click();
    await expect(owner.getByTestId("foto-0").getByTestId("portada")).toBeVisible();
    await owner.getByTestId("foto-0").locator("textarea").fill("Foto real del stock de la tienda");
    await expect(owner.getByText("Fotos sin guardar")).toBeVisible();
    await owner.getByTestId("guardar-galeria").click();
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("Galería guardada");
    await go(owner, "/admin/productos/storm-sobre");
    await expect(owner.getByTestId("foto-0").locator("textarea")).toHaveValue("Foto real del stock de la tienda");
    await expect(owner.getByTestId("foto-0")).toContainText("subida desde el panel (mi stock real)");
    // la tienda la muestra como portada: se ve (no está rota) y se sirve optimizada, con caché larga
    const visitor = await browser.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    await go(v, "/productos/storm-emeralda-sobre");
    const img = v.locator("main img[alt='Foto real del stock de la tienda']").first();
    await expect(img).toBeVisible();
    await expect.poll(async () => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
    const url = new URL(await img.evaluate((e: HTMLImageElement) => e.currentSrc));
    const original = url.pathname === "/_next/image" ? decodeURIComponent(url.searchParams.get("url")!) : url.pathname;
    expect(original).toMatch(/^\/images\/uploads\/[a-f0-9]{24}\.webp$/);
    const raw = await request.get(`${ADMIN}${original}`);
    expect(raw.status()).toBe(200);
    expect(raw.headers()["content-type"]).toBe("image/webp");
    expect(raw.headers()["cache-control"]).toContain("immutable");
    expect(raw.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await raw.body()).length).toBeLessThan(150_000);
    await go(v, "/sellados?q=storm");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Sobre" }).first().locator("img[alt='Foto real del stock de la tienda']")).toBeVisible();
    // móvil: la galería se ve completa y sin desborde
    const movil = await browser.newContext({ baseURL: ADMIN, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const m = await movil.newPage();
    await go(m, "/productos/storm-emeralda-sobre");
    await expect(m.locator("main img[alt='Foto real del stock de la tienda']").first()).toBeVisible();
    expect(await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await movil.close();
    // reordenar: bajar la portada y guardar
    await owner.getByTestId("foto-0").getByRole("button", { name: "Bajar la foto 1" }).click();
    await expect(owner.getByTestId("foto-1").getByTestId("portada")).toHaveCount(0);
    await owner.getByTestId("guardar-galeria").click();
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("Galería guardada");
    await go(v, "/productos/storm-emeralda-sobre");
    await expect(v.locator("main img[alt='Foto real del stock de la tienda']").first()).toBeVisible(); // sigue en la galería, ya no como portada
    // retirar la subida y volver a las fotos del catálogo
    await go(owner, "/admin/productos/storm-sobre");
    const total = await lista.locator("> li").count();
    if (total > 1) {
      await owner.getByTestId("foto-1").getByRole("button", { name: "Quitar la foto 2" }).click();
      await expect(lista.locator("> li")).toHaveCount(total - 1);
      await owner.getByTestId("guardar-galeria").click();
      await expect(owner.getByTestId("mensaje-fotos")).toContainText("Galería guardada");
    }
    owner.once("dialog", (d) => d.accept());
    await owner.getByRole("button", { name: "Volver a las fotos del catálogo" }).click();
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("Galería restablecida");
    await go(owner, "/admin/productos/storm-sobre");
    await expect(lista.locator("> li")).toHaveCount(antes);
    // la API también valida: ruta desconocida, de otro sitio o con recorrido, y galería vacía
    for (const src of ["/images/inventada.webp", "https://evil.example/x.png", "/images/../../.env"]) {
      const res = await owner.request.put(`${ADMIN}/api/admin/products/storm-sobre/gallery`, { data: { items: [{ src, alt: "texto alternativo" }], expectedVersion: 0 }, headers: { Origin: ADMIN } });
      expect(res.status(), src).toBe(400);
    }
    expect((await owner.request.put(`${ADMIN}/api/admin/products/storm-sobre/gallery`, { data: { items: [], expectedVersion: 0 }, headers: { Origin: ADMIN } })).status()).toBe(400);
    await visitor.close();
  });

  test("el historial registra quién, cuándo y los valores anteriores; restablecer vuelve al catálogo por código", async () => {
    await go(owner, "/admin/historial?producto=storm-sobre");
    const tabla = owner.getByTestId("historial");
    await expect(tabla).toContainText("dueno-e2e@example.com");
    await expect(tabla.getByRole("row").filter({ hasText: "Precio base (USD)" }).filter({ hasText: "pendiente" }).filter({ hasText: "USD 10,00" })).toHaveCount(1);
    await expect(tabla.getByRole("row").filter({ hasText: "Precio base (USD)" }).filter({ hasText: "USD 10,00" }).filter({ hasText: "USD 12,50" })).toHaveCount(1);
    await expect(tabla.getByRole("row").filter({ hasText: "Stock" }).filter({ hasText: "24" }).filter({ hasText: "7" })).not.toHaveCount(0);
    await expect(tabla.getByRole("row").filter({ hasText: "Título" })).not.toHaveCount(0);
    await expect(tabla.getByRole("row").filter({ hasText: "Por encargo" })).toHaveCount(2); // sí y no
    await expect(tabla.getByRole("row").filter({ hasText: "Visibilidad" }).filter({ hasText: "oculto" })).toHaveCount(2);
    await expect(tabla.getByRole("row").filter({ hasText: "Fotos" }).filter({ hasText: "mi-stock" }).or(tabla.getByRole("row").filter({ hasText: "Fotos" }))).not.toHaveCount(0);
    // cotización: el historial propio
    await go(owner, "/admin/cotizacion");
    await expect(owner.getByTestId("fx-historial")).toContainText("fijó el valor manual $ 1.300,00");
    await expect(owner.getByTestId("fx-historial")).toContainText("$ 1.234,00");

    // restablecer el producto
    await go(owner, "/admin/productos/storm-sobre");
    owner.once("dialog", (d) => d.accept());
    await owner.getByRole("button", { name: "Restablecer al catálogo por código" }).click();
    await expect(owner.getByTestId("mensaje")).toContainText("Restablecido");
    await expect(owner.locator("#ed-usd")).toHaveValue("");
    await expect(owner.locator("#ed-title")).toHaveValue("Storm Emeralda · Sobre");
    await expect(owner.getByText("Valores del catálogo por código (sin cambios en el panel).")).toBeVisible();
    await go(owner, "/admin/historial?producto=storm-sobre");
    await expect(owner.getByTestId("historial").getByRole("row").filter({ hasText: "Restablecido al código" })).toHaveCount(1);
  });

  test("dos ediciones simultáneas: la segunda se rechaza en vez de pisar la primera", async () => {
    const ok = await patch(owner, "parcial-sobre", { priceUsdMinor: 1200, stock: 12, maxPerOrder: 10, visible: true, expectedVersion: 0 });
    expect(ok.status()).toBe(200);
    const stale = await patch(owner, "parcial-sobre", { priceUsdMinor: 9999, stock: 12, maxPerOrder: 10, visible: true, expectedVersion: 0 });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("stale");
    const version = (await ok.json()).version as number;
    const same = await patch(owner, "parcial-sobre", { priceUsdMinor: 1200, stock: 12, maxPerOrder: 10, visible: true, expectedVersion: version });
    expect((await same.json()).changed).toEqual([]); // sin cambios reales no se escribe nada ni se registra
  });

  test("solicitudes mayoristas: el dueño las ve (solo lectura) y revisarlas sigue apagado; un usuario común no entra", async ({ browser }) => {
    const solicitante = newEmail("solic");
    const ctxA = await browser.newContext({ baseURL: ADMIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const a = await ctxA.newPage();
    await signUp(a, ADMIN, "admin", "Comercio Solicitante", solicitante);
    const creada = await a.request.post(`${ADMIN}/api/mayoristas/solicitud`, { data: { businessName: "Comercio E2E", locality: "Haedo", province: "Buenos Aires", note: "Volumen medio" }, headers: { Origin: ADMIN } });
    expect(creada.status()).toBe(201);
    const ref = (await creada.json()).request.reference as string;
    expect((await a.goto(`${ADMIN}/admin/mayoristas`))?.status()).toBe(404);
    expect((await a.request.patch(`${ADMIN}/api/admin/mayoristas/${ref}`, { data: { status: "aprobada" }, headers: { Origin: ADMIN } })).status()).toBe(403);
    await ctxA.close();

    await go(owner, "/admin/mayoristas");
    await expect(owner.getByTestId("mayoristas-politica")).toContainText("Todavía no se pueden aprobar ni rechazar");
    const fila = owner.getByTestId("mayorista-fila").filter({ hasText: ref });
    await expect(fila).toContainText("Comercio E2E");
    await expect(fila).toContainText("Pendiente de revisión");
    await expect(fila).toContainText(solicitante);
    const r = await owner.request.patch(`${ADMIN}/api/admin/mayoristas/${ref}`, { data: { status: "aprobada" }, headers: { Origin: ADMIN } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error.code).toBe("policy_pending");
  });

  test("sin stock: widget de encargo en la ficha, «Sin stock» en tarjetas, fuera de En stock; con stock vuelve la compra; precio por sobre de la caja", async ({ browser }) => {
    const visitor = await browser.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    const pesos = (t: string | null) => Number((t ?? "").replace(/[^0-9]/g, ""));
    const esperado = (total: number, sobres: number) => Math.floor(total / sobres / 100 + 0.5) * 100;
    // carga desde el panel: USD 150 y stock 0
    await go(owner, "/admin?q=storm-caja");
    await rapido(owner, "storm-caja", { usd: "150", stock: "0" });
    await expect(row(owner, "storm-caja").getByTestId("mensaje")).toContainText("Guardado");
    await go(v, "/productos/storm-emeralda-caja");
    await expect(v.getByTestId("disponibilidad").first()).toHaveText("Sin stock");
    const widget = v.getByTestId("sin-stock-widget");
    await expect(widget).toContainText("Sin stock disponible");
    await expect(widget).toContainText("Podés consultar si lo podemos traer por encargo.");
    await expect(v.getByTestId("pendiente-comercial")).toContainText("seña del 20%");
    await expect(v.getByTestId("pendiente-comercial")).toContainText("No se cobra ninguna seña antes de esa confirmación");
    await expect(v.getByRole("button", { name: "Agregar al carrito" })).toHaveCount(0);
    await expect(v.getByTestId("consultar-encargo")).toBeEnabled();
    // precio por sobre: precio de la caja ÷ 30 sobres (no cartas), con el redondeo del sitio
    const total = pesos(await v.getByTestId("precio").first().textContent());
    expect(total).toBeGreaterThan(0);
    const porSobre = v.getByTestId("precio-por-sobre-ars");
    expect(pesos(await porSobre.textContent())).toBe(esperado(total, 30));
    await expect(v.getByTestId("precio-por-sobre")).toContainText("por sobre comprando la caja");
    await expect(v.getByTestId("precio-por-sobre-usd")).toContainText("USD 5,00 por sobre"); // 150 ÷ 30, exacto
    // el widget envía el producto correcto en la consulta
    await v.getByTestId("consultar-encargo").click();
    await expect(v.getByText("Sumaste 1 unidad a tu consulta por encargo")).toBeVisible();
    await go(v, "/carrito");
    await expect(v.getByTestId("linea-storm-caja")).toContainText("Storm Emeralda · Caja");
    // tarjetas y «En stock»
    await go(v, "/sellados?q=storm");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Caja" }).getByTestId("disponibilidad")).toHaveText("Sin stock");
    await go(v, "/sellados?disp=stock");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Caja" })).toHaveCount(0);
    // cargar una cantidad positiva: vuelve la compra y entra en «En stock»
    await go(owner, "/admin?q=storm-caja");
    await rapido(owner, "storm-caja", { usd: "150", stock: "5" });
    await expect(row(owner, "storm-caja").getByTestId("mensaje")).toContainText("Guardado");
    await go(v, "/productos/storm-emeralda-caja");
    await expect(v.getByTestId("sin-stock-widget")).toHaveCount(0);
    await expect(v.getByTestId("disponibilidad").first()).toHaveText("Disponible");
    await expect(v.getByRole("button", { name: "Agregar al carrito" })).toBeEnabled();
    await go(v, "/sellados?disp=stock");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Caja" })).toHaveCount(1);
    // el precio por sobre sigue la cotización
    await setRate(owner, "1500");
    await go(v, "/productos/storm-emeralda-caja");
    expect(pesos(await v.getByTestId("precio-por-sobre-ars").textContent())).toBe(esperado(pesos(await v.getByTestId("precio").first().textContent()), 30));
    expect(pesos(await v.getByTestId("precio").first().textContent())).toBe(225_000);
    await expect(v.getByTestId("precio-por-sobre-ars")).toContainText("7.500");
    // un producto que no es una caja de sobres no muestra el cálculo
    await go(v, "/productos/storm-emeralda-pack-5-sobres");
    await expect(v.getByTestId("precio-por-sobre")).toHaveCount(0);
    await visitor.close();
  });

  test("lista: filtros por formato y colección; aviso de stock bajo configurable (y validado); edición múltiple de stock y precio", async ({ request }) => {
    // filtros nuevos (se combinan con búsqueda, idioma y estado)
    await go(owner, "/admin?formato=box");
    const filas = owner.getByTestId("admin-lista").locator("li");
    expect(await filas.count()).toBeGreaterThan(0);
    await expect(row(owner, "storm-caja")).toBeVisible();
    await expect(row(owner, "storm-sobre")).toHaveCount(0);
    await go(owner, "/admin?coleccion=storm-emeralda&formato=booster");
    await expect(row(owner, "storm-sobre")).toBeVisible();
    await expect(row(owner, "storm-caja")).toHaveCount(0);
    await expect(owner.locator("#admin-formato")).toHaveValue("booster");
    await expect(owner.locator("#admin-coleccion")).toHaveValue("storm-emeralda");
    await go(owner, "/admin?formato=valor-inexistente&coleccion=nada");
    await expect(owner.getByText("Ningún producto coincide con la búsqueda.")).toBeVisible();

    // aviso de stock bajo: umbral validado, persistente, solo dentro del panel
    await go(owner, "/admin?q=storm-caja");
    await rapido(owner, "storm-caja", { usd: "150", stock: "2" });
    await expect(row(owner, "storm-caja").getByTestId("mensaje")).toContainText("Guardado");
    await go(owner, "/admin");
    await owner.getByTestId("umbral-stock").fill("abc");
    await expect(owner.getByTestId("guardar-umbral")).toBeDisabled();
    await owner.getByTestId("umbral-stock").fill("4");
    await owner.getByTestId("guardar-umbral").click();
    await expect(owner.getByTestId("mensaje-umbral")).toContainText("se avisa cuando quedan 4 unidades o menos");
    await go(owner, "/admin?estado=low");
    await expect(row(owner, "storm-caja").getByTestId("stock-bajo")).toBeVisible();
    for (const r of await owner.getByTestId("admin-lista").locator("li").all()) expect(Number(await r.getByTestId("input-stock").inputValue())).toBeLessThanOrEqual(4);
    await expect(owner.getByRole("link", { name: /Stock bajo \(\d+\)/ })).toHaveAttribute("aria-current", "page");
    await expect(owner.getByTestId("cuenta-low")).not.toHaveText("0");
    // la tienda pública no muestra nada de esto
    const visitor = await owner.context().browser()!.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    await go(v, "/productos/storm-emeralda-caja");
    await expect(v.locator("main")).not.toContainText("Stock bajo");
    await visitor.close();
    // valores inválidos y permisos en la API
    for (const bad of [{ lowStockThreshold: -1 }, { lowStockThreshold: 1.5 }, { lowStockThreshold: 1000 }, { lowStockThreshold: "3" }, {}]) {
      expect((await owner.request.patch(`${ADMIN}/api/admin/settings`, { data: bad, headers: { Origin: ADMIN } })).status(), JSON.stringify(bad)).toBe(400);
    }
    expect((await owner.request.patch(`${ADMIN}/api/admin/settings`, { data: { lowStockThreshold: 3 }, headers: { Origin: "https://otro-sitio.example" } })).status()).toBe(403);
    expect((await request.patch(`${ADMIN}/api/admin/settings`, { data: { lowStockThreshold: 3 }, headers: { Origin: ADMIN } })).status()).toBe(401);
    await go(owner, "/admin");
    await owner.getByTestId("umbral-stock").fill("0");
    await owner.getByTestId("guardar-umbral").click();
    await expect(owner.getByTestId("mensaje-umbral")).toContainText("desactivado");
    await go(owner, "/admin?q=storm-caja");
    await expect(row(owner, "storm-caja").getByTestId("stock-bajo")).toHaveCount(0);
    await owner.getByTestId("umbral-stock").count();

    // edición múltiple: se elige, se aplica a los borradores, se revisa y recién se guarda
    await go(owner, "/admin?q=storm");
    await row(owner, "storm-sobre").getByTestId("seleccionar").check();
    await row(owner, "storm-caja").getByTestId("seleccionar").check();
    await expect(owner.getByTestId("seleccionadas")).toContainText("2 seleccionadas");
    await owner.getByTestId("masivo-stock-modo").selectOption("add");
    await owner.getByTestId("masivo-stock-valor").fill("3");
    await owner.getByTestId("masivo-stock-aplicar").click();
    await expect(owner.getByTestId("masivo-mensaje")).toContainText("Stock aplicado a 2 filas");
    const s0 = Number(await row(owner, "storm-sobre").getByTestId("input-stock").inputValue()); // ya incluye el +3 (borrador)
    expect(s0).toBeGreaterThanOrEqual(3);
    await expect(row(owner, "storm-sobre")).toHaveAttribute("data-dirty", "true");
    await expect(row(owner, "storm-caja").getByTestId("input-stock")).toHaveValue("5"); // 2 + 3
    await owner.getByTestId("masivo-precio-modo").selectOption("pct");
    await owner.getByTestId("masivo-precio-valor").fill("10");
    await owner.getByTestId("masivo-precio-aplicar").click();
    await expect(row(owner, "storm-caja").getByTestId("input-usd")).toHaveValue("165,00"); // 150 + 10%
    // un porcentaje inválido no cambia nada
    await owner.getByTestId("masivo-precio-valor").fill("abc");
    await owner.getByTestId("masivo-precio-aplicar").click();
    await expect(owner.getByTestId("masivo-mensaje")).toContainText("porcentaje");
    await expect(owner.getByTestId("guardar-todo")).toContainText("2 cambios");
    await owner.getByTestId("guardar-todo").click();
    await expect(row(owner, "storm-caja").getByTestId("mensaje")).toContainText("Guardado");
    await go(owner, "/admin?q=storm-caja");
    await expect(row(owner, "storm-caja").getByTestId("input-stock")).toHaveValue("5");
    await expect(row(owner, "storm-caja").getByTestId("input-usd")).toHaveValue("165,00");
    // restar más de lo que hay deja 0 (nunca negativo) y «poner en» fija el valor
    await row(owner, "storm-caja").getByTestId("seleccionar").check();
    await owner.getByTestId("masivo-stock-modo").selectOption("sub");
    await owner.getByTestId("masivo-stock-valor").fill("50");
    await owner.getByTestId("masivo-stock-aplicar").click();
    await expect(row(owner, "storm-caja").getByTestId("input-stock")).toHaveValue("0");
    await owner.getByTestId("masivo-stock-modo").selectOption("set");
    await owner.getByTestId("masivo-stock-valor").fill("5");
    await owner.getByTestId("masivo-stock-aplicar").click();
    await expect(row(owner, "storm-caja").getByTestId("input-stock")).toHaveValue("5");
    await expect(row(owner, "storm-caja")).toHaveAttribute("data-dirty", "false"); // volvió al valor guardado
    // «seleccionar todos» marca solo lo que se ve en la lista
    await go(owner, "/admin?q=storm-caja");
    await owner.getByTestId("seleccionar-todo").check();
    await expect(owner.getByTestId("seleccionadas")).toContainText("1 seleccionada");
  });

  test("fotos: se pueden subir varias a la vez; las inválidas se informan una por una, el orden y la portada se eligen antes de guardar", async ({ browser }) => {
    await go(owner, "/admin/productos/storm-pack5");
    const antes = await owner.getByTestId("galeria-lista").locator("li").count();
    await owner.getByTestId("subir-foto").setInputFiles([
      { name: "primera.png", mimeType: "image/png", buffer: await png(800, 600) },
      { name: "rota.png", mimeType: "image/png", buffer: Buffer.from("esto no es una imagen") },
      { name: "segunda.png", mimeType: "image/png", buffer: await png(700, 700) },
    ]);
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("2 fotos subidas");
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("No se subieron 1: rota.png");
    await expect(owner.getByTestId("galeria-lista").locator("li")).toHaveCount(antes + 2);
    await expect(owner.getByText("Fotos sin guardar")).toBeVisible();
    // la última subida pasa a portada y la lista se guarda con ese orden
    await owner.getByTestId(`foto-${antes + 1}`).getByTestId("hacer-portada").click();
    await expect(owner.getByTestId("foto-0").getByTestId("portada")).toBeVisible();
    await expect(owner.getByTestId("foto-0")).toContainText("700×700");
    await owner.getByTestId("guardar-galeria").click();
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("Galería guardada");
    const v = await browser.newContext({ baseURL: ADMIN });
    const pv = await v.newPage();
    await go(pv, "/productos/storm-emeralda-pack-5-sobres");
    expect(await pv.locator("main img[src*='uploads']").count()).toBeGreaterThan(0);
    await v.close();
    // el límite de 12 se respeta y se informa
    await go(owner, "/admin/productos/storm-pack5");
    const archivos = await Promise.all(Array.from({ length: 12 }, async (_, i) => ({ name: `lote-${i}.png`, mimeType: "image/png", buffer: await png(320 + i * 7, 320 + i * 11) })));
    await owner.getByTestId("subir-foto").setInputFiles(archivos);
    await expect(owner.getByTestId("mensaje-fotos")).toContainText("el máximo");
    await expect(owner.getByTestId("galeria-lista").locator("li")).toHaveCount(12);
  });

  test("tarjetas: «Bajo stock» solo con stock entre 1 y el umbral; «Sin stock» con 0; sin cartel si el umbral está apagado; etiqueta de disponibilidad en tarjeta y ficha", async ({ browser }) => {
    const visitor = await browser.newContext({ baseURL: ADMIN });
    const v = await visitor.newPage();
    const tarjeta = () => v.locator("article").filter({ hasText: "Storm Emeralda · Caja" }).first();
    const fijarUmbral = async (n: string) => {
      await go(owner, "/admin");
      await owner.getByTestId("umbral-stock").fill(n);
      if (await owner.getByTestId("guardar-umbral").isEnabled()) await owner.getByTestId("guardar-umbral").click();
      await expect(owner.getByTestId("umbral-stock")).toHaveValue(n);
    };
    const fijarStock = async (n: string) => {
      await go(owner, "/admin?q=storm-caja");
      await rapido(owner, "storm-caja", { stock: n });
      await expect(row(owner, "storm-caja").getByTestId("mensaje")).toContainText(/Guardado|Sin cambios/);
    };
    await fijarUmbral("3");
    await fijarStock("2");
    await go(v, "/sellados?q=storm");
    const banda = tarjeta().getByTestId("bajo-stock");
    await expect(banda).toBeVisible();
    await expect(banda).toContainText("Bajo stock");
    // etiqueta pequeña (cápsula ≈ 160×24 px), con una llama SVG a cada lado monocromáticas decorativas (aria-hidden) y sin emojis
    await expect(banda).toHaveText(/^\s*Bajo stock\s*$/i);
    await expect(banda.locator("svg[aria-hidden=true]")).toHaveCount(2);
    expect(await banda.evaluate((el) => /\p{Extended_Pictographic}/u.test((el as HTMLElement).innerText))).toBe(false);
    const card = (await tarjeta().boundingBox())!;
    const b = (await banda.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(22);
    expect(b.height).toBeLessThanOrEqual(26);
    expect(b.width).toBeGreaterThanOrEqual(150);
    expect(b.width).toBeLessThanOrEqual(175);
    expect(b.width).toBeLessThan(card.width * 0.95); // no ocupa todo el ancho
    expect(Math.abs(b.x + b.width / 2 - (card.x + card.width / 2))).toBeLessThanOrEqual(2); // centrada
    expect(b.y).toBeLessThan(card.y); // sobresale por encima del borde superior
    expect(b.y + b.height).toBeGreaterThan(card.y);
    expect(["rgb(255, 255, 255)"]).toContain(await banda.evaluate((el) => getComputedStyle(el).color));
    // no tapa el formato ni los favoritos
    const fav = (await tarjeta().getByRole("button", { name: /favoritos/i }).first().boundingBox())!;
    const formato = (await tarjeta().getByText("CAJA", { exact: true }).first().boundingBox())!;
    const choca = (r: { x: number; y: number; width: number; height: number }) => !(b.x + b.width <= r.x || r.x + r.width <= b.x || b.y + b.height <= r.y || r.y + r.height <= b.y);
    expect(choca(fav)).toBe(false);
    expect(choca(formato)).toBe(false);
    await expect(tarjeta().getByTestId("disponibilidad")).toHaveText("Disponible");
    // un producto con más unidades que el umbral no lleva cartel
    await fijarStock("4");
    await go(v, "/sellados?q=storm");
    await expect(tarjeta().getByTestId("bajo-stock")).toHaveCount(0);
    await expect(tarjeta().getByTestId("disponibilidad")).toHaveText("Disponible");
    // el umbral se respeta (4 ≤ 4) y apagarlo quita el cartel
    await fijarUmbral("4");
    await go(v, "/sellados?q=storm");
    await expect(tarjeta().getByTestId("bajo-stock")).toBeVisible();
    await fijarUmbral("0");
    await go(v, "/sellados?q=storm");
    await expect(tarjeta().getByTestId("bajo-stock")).toHaveCount(0);
    await expect(tarjeta().getByTestId("disponibilidad")).toHaveText("Disponible");
    // stock 0: «Sin stock» y nunca «Bajo stock» (aunque el umbral esté activo)
    await fijarUmbral("3");
    await fijarStock("0");
    await go(v, "/sellados?q=storm");
    await expect(tarjeta().getByTestId("bajo-stock")).toHaveCount(0);
    await expect(tarjeta().getByTestId("disponibilidad")).toHaveText("Sin stock");
    await expect(v.locator("article").filter({ hasText: "Storm Emeralda · Caja" }).first()).not.toContainText("Bajo stock");
    // la ficha usa la misma etiqueta y la misma regla
    await go(v, "/productos/storm-emeralda-caja");
    await expect(v.getByTestId("disponibilidad").first()).toHaveText("Sin stock");
    await fijarStock("5");
    await go(v, "/productos/storm-emeralda-caja");
    await expect(v.getByTestId("disponibilidad").first()).toHaveText("Disponible");
    await visitor.close();
  });

  test("accesibilidad (axe) de la lista, la ficha, la cotización y el historial, en escritorio y móvil", async ({ browser }) => {
    const audit = async (page: Page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((x) => `${x.id}: ${x.help} → ${x.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    for (const p of ["/admin", "/admin/productos/storm-sobre", "/admin/cotizacion", "/admin/historial", "/admin/mayoristas"]) {
      await go(owner, p);
      expect(await audit(owner), p).toEqual([]);
    }
    const ctx = await browser.newContext({ baseURL: ADMIN, viewport: { width: 390, height: 844 }, storageState: await owner.context().storageState() });
    const m = await ctx.newPage();
    for (const p of ["/admin", "/admin/productos/storm-sobre", "/admin/cotizacion"]) {
      await go(m, p);
      expect(await audit(m), `móvil ${p}`).toEqual([]);
      const sobra = await m.evaluate(() => {
        const vw = innerWidth;
        const culpables = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > vw + 1 && e.getBoundingClientRect().width > 0).slice(0, 6).map((e) => `${e.tagName}.${String(e.className).slice(0, 50)} →${Math.round(e.getBoundingClientRect().right)}`);
        return { sobra: document.documentElement.scrollWidth - vw, culpables };
      });
      expect(sobra, `desborde en ${p}`).toEqual({ sobra: expect.any(Number), culpables: expect.any(Array) });
      expect(sobra.sobra, `desborde en ${p}: ${sobra.culpables.join(" | ")}`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
});
