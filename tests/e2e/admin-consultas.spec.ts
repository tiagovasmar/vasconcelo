import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor «consultas» (:3104, catálogo de prueba, ADMIN_EMAIL=dueno-e2e@example.com), con base propia: estas pruebas mueven stock y precios de los productos de
// prueba y no deben alterar los conteos de admin.spec.ts. Solo se tocan ejemplo-sobre (stock 40) y ejemplo-caja (stock 2).
const stamp = process.env.E2E_STAMP!;
const ADMIN = "http://localhost:3104";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const mailDir = path.resolve(`.local/data/e2e-${stamp}-consultas-mail`);

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const letters = (s: string) => s.replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]); // los nombres de persona llevan solo letras
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
/** Deja la sesión del dueño iniciada: ingresa si la cuenta ya existe o la registra y confirma. */
async function ownerSession(page: Page) {
  const signIn = () => page.request.post(`${ADMIN}/api/auth/sign-in/email`, { data: { email: OWNER, password: PASSWORD }, headers: { Origin: ADMIN } });
  if ((await signIn()).ok()) return;
  const up = await page.request.post(`${ADMIN}/api/auth/sign-up/email`, { data: { name: "Dueño de la Tienda", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: ADMIN } });
  if (up.ok()) {
    await page.request.post(`${ADMIN}/api/auth/send-verification-email`, { data: { email: OWNER, callbackURL: "/cuenta/verificado" }, headers: { Origin: ADMIN } });
    await go(page, await verificationLink(OWNER));
    return;
  }
  throw new Error("No se pudo iniciar la sesión del dueño");
}

// Misma sesión de invitado (cookie) en los reintentos: así se prueba la idempotencia como la vive un navegador.
const GUEST_SESSION = `e2e-guest-${uid()}${uid()}`;
type Item = { productId: string; quantity: number; mode?: "buy" | "encargo" };
const newInquiry = async (request: APIRequestContext, ip: string, items: Item[], name: string, phone?: string, key = `e2e${uid()}${uid()}`) => {
  const r = await request.post(`${ADMIN}/api/inquiries`, { data: { items, delivery: { method: "retiro" }, payment: "efectivo", contactName: name, contactPhone: phone, idempotencyKey: key }, headers: { Origin: ADMIN, "x-forwarded-for": ip, Cookie: `consulta_sid=${GUEST_SESSION}` } });
  return { res: r, body: await r.json() as { reference?: string; error?: { code: string } } };
};
const metric = async (page: Page, id: string) => Number(((await page.getByTestId(`metrica-${id}`).locator("[data-valor]").innerText()).replace(/\D/g, "")) || 0);
const stockOf = async (page: Page, id: string) => {
  await go(page, "/admin");
  return Number(await page.getByTestId(`admin-fila-${id}`).getByTestId("input-stock").inputValue());
};
const search = async (page: Page, q: string) => go(page, `/admin/consultas?q=${encodeURIComponent(q)}`);
/** Convierte lo precargado: revisar → resumen → confirmar (con doble clic opcional). */
async function revisarYConfirmar(page: Page, dbl = false) {
  await page.getByTestId("revisar-venta").click();
  await expect(page.getByTestId("venta-resumen")).toBeVisible();
  if (dbl) await page.getByTestId("confirmar-venta").dblclick();
  else await page.getByTestId("confirmar-venta").click();
  await expect(page.getByTestId("venta-registrada-aviso")).toBeVisible(); // el resultado se ve en la propia consulta
}

const person = letters(`Cliente Prueba ${uid()}`);
let refA = "";
let refLost = "";
let refStock = "";
let refLink = "";
let refEnc = "";
const nameLink = letters(`Vinculada Cliente ${uid()}`);
const nameStock = letters(`Sinstock Cliente ${uid()}`);
const nameLost = letters(`Perdida Cliente ${uid()}`);
const nameEnc = letters(`Encargo Cliente ${uid()}`);

test.describe("registro de la consulta", () => {
  test("al confirmar el pedido queda guardada (sin duplicados por reintento) y no toca el stock; agregar al carrito no registra nada", async ({ page, request, ip }) => {
    await ownerSession(page);
    await go(page, "/admin/consultas");
    const before = await metric(page, "generadas");
    const stock0 = await stockOf(page, "ejemplo-sobre");

    await page.context().addInitScript(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "ejemplo-sobre", quantity: 1, priceMinor: 1250000, mode: "buy" }] })));
    await go(page, "/carrito");
    await search(page, person);
    await expect(page.getByTestId("consultas-vacio")).toBeVisible(); // ni el carrito ni abrirlo generan una consulta

    const key = `e2e${uid()}${uid()}`;
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => newInquiry(request, ip, [{ productId: "ejemplo-sobre", quantity: 3 }, { productId: "ejemplo-caja", quantity: 1 }], person, "11 5555-0101", key)));
    expect([a, b, c].map((x) => x.res.status()).sort()).toContain(201);
    expect(new Set([a, b, c].map((x) => x.body.reference)).size).toBe(1);
    refA = a.body.reference!;
    refLost = (await newInquiry(request, ip, [{ productId: "ejemplo-sobre", quantity: 1 }], nameLost)).body.reference!;
    refStock = (await newInquiry(request, ip, [{ productId: "ejemplo-caja", quantity: 1 }], nameStock)).body.reference!;
    refLink = (await newInquiry(request, ip, [{ productId: "ejemplo-sobre", quantity: 1 }], nameLink)).body.reference!;
    refEnc = (await newInquiry(request, ip, [{ productId: "ejemplo-sobre", quantity: 1 }, { productId: "ejemplo-caja", quantity: 1, mode: "encargo" }], nameEnc)).body.reference!;
    expect([refLost, refStock, refLink, refEnc].every(Boolean)).toBe(true);

    await go(page, "/admin/consultas");
    expect(await metric(page, "generadas")).toBeGreaterThanOrEqual(before + 5);
    await search(page, person);
    await expect(page.getByTestId("consulta-fila")).toHaveCount(1);
    await expect(page.getByTestId("consulta-estado")).toHaveText("Pendiente");
    await expect(page.getByTestId("consulta-contacto")).toHaveText("Consulta generada");
    expect(await stockOf(page, "ejemplo-sobre")).toBe(stock0);
  });

  test("el teléfono se valida en el servidor y la consulta guarda nombre, teléfono, productos, precios, entrega y pago", async ({ page, request, ip }) => {
    await ownerSession(page);
    expect((await newInquiry(request, ip, [{ productId: "ejemplo-sobre", quantity: 1 }], "Alguien Más", "no-es-un-telefono")).res.status()).toBe(400);
    await go(page, `/admin/consultas/${refA}`);
    await expect(page.getByTestId("consulta-nombre")).toHaveText(person);
    await expect(page.getByTestId("consulta-telefono")).toHaveText("11 5555-0101");
    const original = page.getByTestId("consulta-original");
    await expect(original).toContainText("Set de ejemplo · Sobre");
    await expect(original).toContainText("Retiro");
    await expect(original).toContainText("Efectivo");
    await expect(page.getByTestId("original-linea")).toHaveCount(2);
    await expect(page.getByTestId("detalle-contacto")).toContainText("sin confirmar");
  });
});

test.describe("gestión", () => {
  test("confirmar contacto a mano, cambiar de estado y notas: todo queda en el historial y no mueve el stock", async ({ page }) => {
    await ownerSession(page);
    const stock0 = await stockOf(page, "ejemplo-sobre");
    await go(page, `/admin/consultas/${refA}`);
    await page.getByTestId("confirmar-contacto").click();
    await expect(page.getByTestId("mensaje-consulta")).toHaveText("Contacto confirmado.");
    await expect(page.getByTestId("detalle-contacto")).toContainText("Contacto confirmado");
    await page.getByTestId("estado-nuevo").selectOption("en_seguimiento");
    await page.getByTestId("guardar-estado").click();
    await expect(page.getByTestId("detalle-estado")).toHaveText("En seguimiento");
    await page.getByTestId("nota-nueva").fill("Le escribí el martes; dice que confirma el jueves.");
    await page.getByTestId("agregar-nota").click();
    await expect(page.getByTestId("mensaje-consulta")).toHaveText("Nota agregada.");
    await expect(page.getByTestId("historial-consulta")).toContainText("Le escribí el martes");
    await expect(page.getByTestId("historial-consulta")).toContainText("Pendiente → En seguimiento");
    await page.reload();
    await expect(page.getByTestId("detalle-estado")).toHaveText("En seguimiento");
    expect(await stockOf(page, "ejemplo-sobre")).toBe(stock0);
  });

  test("«No concretada» guarda el motivo opcional", async ({ page }) => {
    await ownerSession(page);
    await go(page, `/admin/consultas/${refLost}`);
    await page.getByTestId("estado-nuevo").selectOption("no_concretada");
    await page.getByTestId("motivo").fill("Le pareció caro");
    await page.getByTestId("guardar-estado").click();
    await expect(page.getByTestId("detalle-estado")).toHaveText("No concretada");
    await expect(page.getByTestId("motivo-guardado")).toContainText("Le pareció caro");
  });

  test("búsqueda por persona, teléfono (con y sin formato) y número; filtros por estado, contacto y fecha", async ({ page }) => {
    await ownerSession(page);
    for (const q of [person, "1155550101", refA.toLowerCase()]) {
      await search(page, q);
      await expect(page.getByTestId("consulta-fila")).toHaveCount(1);
    }
    await search(page, "zzz-nadie-zzz");
    await expect(page.getByTestId("consultas-vacio")).toBeVisible();
    await go(page, `/admin/consultas?q=${encodeURIComponent(person)}&estado=en_seguimiento&contacto=confirmado`);
    await expect(page.getByTestId("consulta-fila")).toHaveCount(1);
    await go(page, `/admin/consultas?q=${encodeURIComponent(person)}&estado=pendiente`);
    await expect(page.getByTestId("consultas-vacio")).toBeVisible();
    await go(page, `/admin/consultas?q=${encodeURIComponent(person)}&desde=2999-01-01`);
    await expect(page.getByTestId("consultas-vacio")).toBeVisible();
    await go(page, "/admin/consultas");
    await page.getByTestId("f-q").fill(person);
    await page.getByTestId("f-estado").selectOption("en_seguimiento");
    await page.getByTestId("f-aplicar").click();
    await expect(page).toHaveURL(/estado=en_seguimiento/);
    await expect(page.getByTestId("consulta-fila")).toHaveCount(1);
  });
});

test.describe("convertir en venta", () => {
  test("precarga la consulta, permite editar, muestra total y stock; el doble clic crea UNA venta y descuenta solo lo vendido", async ({ page }) => {
    await ownerSession(page);
    const sobre0 = await stockOf(page, "ejemplo-sobre");
    const caja0 = await stockOf(page, "ejemplo-caja");
    await go(page, `/admin/consultas/${refA}`);
    await page.getByTestId("convertir-venta").click();
    await expect(page).toHaveURL(/\/convertir$/);
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByTestId("convertir-titulo")).toContainText(person);
    await expect(page.getByTestId("venta-cantidad-ejemplo-sobre")).toHaveValue("3");
    await expect(page.getByTestId("venta-precio-ejemplo-sobre")).toHaveValue("12500");
    await expect(page.getByTestId("venta-cantidad-ejemplo-caja")).toHaveValue("1");
    await expect(page.getByTestId("venta-pago")).toHaveValue("efectivo");

    // Se vende menos de lo consultado: 2 sobres y la caja, y la caja a otro precio.
    await page.getByTestId("venta-cantidad-ejemplo-sobre").fill("2");
    await page.getByTestId("venta-precio-ejemplo-caja").fill("200000");
    await expect(page.getByTestId("venta-total-armado")).toContainText("225.000"); // 2 × 12.500 + 200.000
    await page.getByTestId("revisar-venta").click();
    await expect(page.getByTestId("venta-resumen")).toBeVisible();
    await expect(page.getByTestId("stock-resultante-ejemplo-sobre")).toHaveText(new RegExp(`${sobre0}\\s*→\\s*${sobre0 - 2}`));
    await expect(page.getByTestId("stock-resultante-ejemplo-caja")).toHaveText(new RegExp(`${caja0}\\s*→\\s*${caja0 - 1}`));
    await expect(page.getByTestId("venta-total-resumen")).toContainText("225.000");
    await page.getByTestId("confirmar-venta").dblclick();
    await expect(page).toHaveURL(`${ADMIN}/admin/consultas/${refA}?venta=ok`);
    await expect(page.getByTestId("venta-registrada-aviso")).toContainText("Venta registrada");

    await go(page, "/admin/ventas");
    await expect(page.getByTestId("venta-origen").filter({ hasText: person })).toHaveCount(1); // una sola venta de esta persona, con su consulta
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre0 - 2);
    expect(await stockOf(page, "ejemplo-caja")).toBe(caja0 - 1);

    await go(page, `/admin/consultas/${refA}`);
    await expect(page.getByTestId("detalle-estado")).toHaveText("Convertida en venta");
    await expect(page.getByTestId("venta-vigente")).toBeVisible();
    await expect(page.getByTestId("original-linea").first()).toContainText("3"); // la consulta original sigue con 3 sobres
    await expect(page.getByTestId("convertir-venta")).toHaveCount(0);
  });

  test("la página de conversión de una consulta ya convertida redirige al detalle (no hay segunda venta)", async ({ page }) => {
    await ownerSession(page);
    await page.goto(`/admin/consultas/${refA}/convertir`);
    await expect(page).toHaveURL(new RegExp(`/admin/consultas/${refA}$`));
  });

  test("sin stock suficiente se avisa y se bloquea la confirmación; nada cambia", async ({ page }) => {
    await ownerSession(page);
    const caja0 = await stockOf(page, "ejemplo-caja");
    await go(page, `/admin/consultas/${refStock}/convertir`);
    await page.getByTestId("venta-cantidad-ejemplo-caja").fill(String(caja0 + 5));
    await page.getByTestId("revisar-venta").click();
    await expect(page.getByTestId("venta-resumen")).toContainText("Stock insuficiente");
    await expect(page.getByTestId("confirmar-venta")).toBeDisabled();
    expect(await stockOf(page, "ejemplo-caja")).toBe(caja0);
    await go(page, `/admin/consultas/${refStock}`);
    await expect(page.getByTestId("detalle-estado")).toHaveText("Pendiente");
  });

  test("el servidor valida el stock aunque el navegador lo permita: 409 con el detalle y nada cambia", async ({ page }) => {
    await ownerSession(page);
    const caja0 = await stockOf(page, "ejemplo-caja");
    const r = await page.request.post(`${ADMIN}/api/admin/ventas`, { data: { idempotencyKey: `e2e${uid()}${uid()}`, inquiryId: refStock, paymentMethod: "efectivo", items: [{ productId: "ejemplo-caja", quantity: caja0 + 1, unitPriceMinor: 10000 }] }, headers: { Origin: ADMIN } });
    expect(r.status()).toBe(409);
    expect((await r.json()).error.code).toBe("insufficient_stock");
    expect(await stockOf(page, "ejemplo-caja")).toBe(caja0);
    await go(page, `/admin/consultas/${refStock}`);
    await expect(page.getByTestId("detalle-estado")).toHaveText("Pendiente");
  });

  test("los productos por encargo no entran en la venta ni tocan el stock", async ({ page }) => {
    await ownerSession(page);
    const caja0 = await stockOf(page, "ejemplo-caja");
    await go(page, `/admin/consultas/${refEnc}/convertir`);
    await expect(page.getByTestId("aviso-encargos")).toContainText("Set de ejemplo · Caja");
    await expect(page.getByTestId("venta-linea-ejemplo-caja")).toHaveCount(0);
    await expect(page.getByTestId("venta-linea-ejemplo-sobre")).toBeVisible();
    await revisarYConfirmar(page);
    expect(await stockOf(page, "ejemplo-caja")).toBe(caja0);
  });

  test("el mismo envío repetido (misma clave) devuelve la misma venta sin descontar de nuevo", async ({ page }) => {
    await ownerSession(page);
    const sobre0 = await stockOf(page, "ejemplo-sobre");
    const data = { idempotencyKey: `e2e${uid()}${uid()}`, paymentMethod: "efectivo", items: [{ productId: "ejemplo-sobre", quantity: 1, unitPriceMinor: 1250000 }] };
    const rs = await Promise.all([1, 2, 3, 4].map(() => page.request.post(`${ADMIN}/api/admin/ventas`, { data, headers: { Origin: ADMIN } })));
    const bodies = await Promise.all(rs.map((r) => r.json()));
    expect(rs.every((r) => r.ok())).toBe(true);
    expect(new Set(bodies.map((b) => b.sale.id)).size).toBe(1);
    expect(bodies.filter((b) => !b.replayed)).toHaveLength(1);
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre0 - 1);
  });
});

test.describe("anulación, nueva conversión y vinculación", () => {
  test("anular la venta devuelve el stock una vez, la consulta vuelve a seguimiento y deja de contar como conversión; se puede convertir de nuevo y el historial se conserva", async ({ page }) => {
    await ownerSession(page);
    await go(page, "/admin/consultas");
    const conv0 = await metric(page, "convertidas");
    const sobre0 = await stockOf(page, "ejemplo-sobre");
    const caja0 = await stockOf(page, "ejemplo-caja");
    await go(page, `/admin/consultas/${refA}`);
    const saleId = (await page.getByTestId("venta-vigente-id").innerText()).trim();
    await page.getByTestId("anular-venta").click();
    await page.getByTestId("confirmar-anular").click();
    await expect(page.getByRole("alert").filter({ hasText: "motivo" })).toBeVisible(); // sin motivo no se anula
    await page.getByTestId("motivo-anulacion-consulta").fill("Se arrepintió");
    await page.getByTestId("confirmar-anular").dblclick();
    await expect(page.getByTestId("venta-vigente")).toHaveCount(0);
    await expect(page.getByTestId("detalle-estado")).toHaveText("En seguimiento");
    await expect(page.getByTestId("historial-consulta")).toContainText("Stock devuelto");
    await expect(page.getByTestId("ventas-anuladas")).toContainText(saleId);
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre0 + 2);
    expect(await stockOf(page, "ejemplo-caja")).toBe(caja0 + 1);
    await go(page, "/admin/consultas");
    expect(await metric(page, "convertidas")).toBe(conv0 - 1);

    // Nueva conversión de la misma consulta con otra venta.
    await go(page, `/admin/consultas/${refA}/convertir`);
    await page.getByTestId("venta-cantidad-ejemplo-sobre").fill("1");
    await page.getByTestId("venta-cantidad-ejemplo-caja").fill("1");
    await revisarYConfirmar(page);
    await go(page, `/admin/consultas/${refA}`);
    await expect(page.getByTestId("detalle-estado")).toHaveText("Convertida en venta");
    await expect(page.getByTestId("venta-vigente-id")).not.toHaveText(saleId);
    await expect(page.getByTestId("ventas-anuladas")).toContainText(saleId); // la anulada sigue en el historial
    await expect(page.getByTestId("historial-consulta").getByTestId("evento")).toHaveCount(await page.getByTestId("evento").count());
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre0 + 2 - 1);
    // La primera sigue anulada: anularla otra vez no devuelve nada.
    const again = await page.request.post(`${ADMIN}/api/admin/ventas/${saleId}/anular`, { data: { reason: "Otra vez" }, headers: { Origin: ADMIN } });
    expect(again.status()).toBe(409);
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre0 + 2 - 1);
  });

  test("vincular una venta ya registrada a una consulta no vuelve a descontar stock", async ({ page }) => {
    await ownerSession(page);
    const sale = await page.request.post(`${ADMIN}/api/admin/ventas`, { data: { idempotencyKey: `e2e${uid()}${uid()}`, paymentMethod: "transferencia", items: [{ productId: "ejemplo-sobre", quantity: 1, unitPriceMinor: 1250000 }] }, headers: { Origin: ADMIN } });
    expect(sale.status()).toBe(200);
    const saleId = (await sale.json()).sale.id as string;
    const sobre1 = await stockOf(page, "ejemplo-sobre");
    await go(page, `/admin/consultas/${refLink}`);
    await page.getByTestId("venta-vincular").selectOption(saleId);
    await page.getByTestId("confirmar-vincular").click();
    await expect(page.getByTestId("detalle-estado")).toHaveText("Convertida en venta");
    await expect(page.getByTestId("venta-vigente-id")).toHaveText(saleId);
    expect(await stockOf(page, "ejemplo-sobre")).toBe(sobre1);
    await go(page, "/admin/ventas");
    await expect(page.getByTestId(`venta-${saleId}`)).toContainText(nameLink);
  });
});

test.describe("consulta manual y métricas", () => {
  test("se carga una consulta que llegó por otro medio (doble clic = una sola) con el contacto confirmado", async ({ page }) => {
    await ownerSession(page);
    const nombre = letters(`Manual Cliente ${uid()}`);
    await go(page, "/admin/consultas");
    const manual0 = Number((await page.getByTestId("metrica-generadas").innerText()).match(/(\d+) manuales/)![1]);
    await page.getByTestId("nueva-consulta").click();
    await page.locator("html[data-hydrated='true']").waitFor();
    await page.getByTestId("m-nombre").fill(nombre);
    await page.getByTestId("m-tel").fill("11 2222-3333");
    await page.getByTestId("m-medio").selectOption("instagram");
    await page.getByTestId("m-buscar").fill("Set de ejemplo · Sobre");
    await page.getByTestId("m-agregar-ejemplo-sobre").click();
    await page.getByTestId("m-cant-ejemplo-sobre").fill("2");
    await page.getByTestId("m-precio-ejemplo-sobre").fill("12500");
    await expect(page.getByTestId("m-guardar")).toBeEnabled();
    await page.getByTestId("m-guardar").dblclick();
    await expect(page).toHaveURL(/\/admin\/consultas\/TT-/);
    await expect(page.getByTestId("consulta-nombre")).toHaveText(nombre);
    await expect(page.getByTestId("detalle-contacto")).toContainText("Contacto confirmado");
    await expect(page.getByTestId("historial-consulta")).toContainText("Instagram");
    await search(page, nombre);
    await expect(page.getByTestId("consulta-fila")).toHaveCount(1);
    await expect(page.getByTestId("consulta-fila")).toContainText("Cargada a mano");
    await go(page, "/admin/consultas");
    expect(Number((await page.getByTestId("metrica-generadas").innerText()).match(/(\d+) manuales/)![1])).toBe(manual0 + 1);
  });

  test("las métricas explican qué se cuenta y calculan la conversión sobre generadas y sobre contactos", async ({ page }) => {
    await ownerSession(page);
    await go(page, "/admin/consultas");
    const g = await metric(page, "generadas");
    const c = await metric(page, "convertidas");
    const k = await metric(page, "contactos");
    const pct = (n: number, d: number) => (d ? new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(n / d) : "—");
    await expect(page.getByTestId("metrica-conversion")).toContainText(pct(c, g));
    await expect(page.getByTestId("metrica-conversion")).toContainText(`${c} convertidas ÷ ${g} consultas generadas`);
    await expect(page.getByTestId("metrica-conversion-contactos")).toContainText(pct(c, k));
    await expect(page.locator("body")).toContainText("creadas");
    await expect(page.locator("body")).toContainText("fecha de la venta");
    await go(page, "/admin/consultas?desde=2000-01-01&hasta=2000-01-02");
    await expect(page.getByTestId("metrica-conversion")).toContainText("—");
    await expect(page.getByTestId("metrica-ingresos")).toContainText("0");
  });
});

test.describe("acceso y presentación", () => {
  test("un invitado no entra a las páginas ni a las operaciones nuevas; otra cuenta recibe 404/403; origen ajeno 403", async ({ page, request }) => {
    for (const p of ["/admin/consultas", "/admin/consultas/nueva", `/admin/consultas/${refA}`, `/admin/consultas/${refA}/convertir`]) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/cuenta\/ingresar\?next=/);
    }
    const venta = { idempotencyKey: `e2e${uid()}${uid()}`, inquiryId: refA, paymentMethod: "efectivo", items: [{ productId: "ejemplo-sobre", quantity: 1, unitPriceMinor: 100 }] };
    expect((await request.post(`${ADMIN}/api/admin/ventas`, { data: venta, headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.post(`${ADMIN}/api/admin/consultas`, { data: {}, headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.patch(`${ADMIN}/api/admin/consultas/${refA}`, { data: { action: "confirm_contact" }, headers: { Origin: ADMIN } })).status()).toBe(401);
    expect((await request.post(`${ADMIN}/api/admin/ventas/VT-AAAAAAAA/vincular`, { data: { inquiryId: refA }, headers: { Origin: ADMIN } })).status()).toBe(401);
    const email = `otra-${uid()}@example.com`;
    const up = await page.request.post(`${ADMIN}/api/auth/sign-up/email`, { data: { name: "Otra Persona", email, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: ADMIN } });
    expect(up.ok()).toBe(true);
    await page.request.post(`${ADMIN}/api/auth/send-verification-email`, { data: { email: email, callbackURL: "/cuenta/verificado" }, headers: { Origin: ADMIN } });
    await go(page, await verificationLink(email));
    for (const p of ["/admin/consultas", `/admin/consultas/${refA}`]) expect((await page.goto(p))!.status(), p).toBe(404);
    expect((await page.request.post(`${ADMIN}/api/admin/ventas`, { data: venta, headers: { Origin: ADMIN } })).status()).toBe(403);
    expect((await page.request.patch(`${ADMIN}/api/admin/consultas/${refA}`, { data: { action: "confirm_contact" }, headers: { Origin: ADMIN } })).status()).toBe(403);
    expect((await page.request.post(`${ADMIN}/api/admin/ventas/VT-AAAAAAAA/vincular`, { data: { inquiryId: refA }, headers: { Origin: ADMIN } })).status()).toBe(403);
    await ownerSession(page);
    expect((await page.request.post(`${ADMIN}/api/admin/ventas`, { data: venta, headers: { Origin: "https://otro-sitio.example" } })).status()).toBe(403);
  });

  test("accesibilidad (axe) y sin desborde horizontal en escritorio y celular", async ({ page }) => {
    await ownerSession(page);
    const paginas = ["/admin/consultas", `/admin/consultas/${refA}`, `/admin/consultas/${refLost}/convertir`, "/admin/consultas/nueva", "/admin/ventas"];
    for (const p of paginas) {
      await go(page, p);
      const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(res.violations.map((v) => `${p}: ${v.id} ${v.nodes.length} → ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} [${n.any[0]?.message ?? ""}]`).join(" | ")}`), p).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    for (const p of paginas) {
      await go(page, p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `desborde en ${p}`).toBeLessThanOrEqual(1);
    }
  });
});
