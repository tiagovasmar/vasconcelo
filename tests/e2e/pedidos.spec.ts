import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { expect, test as base, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { go } from "./helpers";

/**
 * Pedidos, encargos, comprobantes, avisos de reposición y catálogo mayorista sobre el BUILD de producción (servidor «pedidos», :3109) con PostgreSQL real descartable,
 * correo local aislado y almacén privado local de comprobantes. Datos ficticios: nada de esto toca producción ni escribe a clientes reales.
 */
const stamp = process.env.E2E_STAMP!;
const ORIGIN = "http://localhost:3109";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const MAIL_DIR = path.resolve(`.local/data/e2e-${stamp}-pedidos-mail`);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const newEmail = (tag: string) => `${tag}-${uid()}@example.com`.toLowerCase();
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const key = () => `e2e${uid()}${uid()}`.slice(0, 40).padEnd(20, "0");
const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});
const H = { Origin: ORIGIN };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF e2e");

async function mailLink(to: string, kind: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")) as { to: string; kind: string; link?: string; subject?: string }).filter((m) => m.to === to && m.kind === kind) : [];
    if (found.length) return found[found.length - 1].link ?? "";
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo local (${kind}) para ${to}`);
}
async function signUp(page: Page, name: string, email: string) {
  const res = await page.request.post(`${ORIGIN}/api/auth/sign-up/email`, { data: { name, email, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: H });
  expect(res.ok()).toBe(true);
  await page.request.post(`${ORIGIN}/api/auth/send-verification-email`, { data: { email: email, callbackURL: "/cuenta/verificado" }, headers: { Origin: ORIGIN } });
  await go(page, await mailLink(email, "verificacion"));
  await expect(page.getByTestId("verificacion-ok")).toBeVisible();
}
/** Contexto nuevo con IP propia (otra persona / otro navegador). */
async function newPerson(browser: Browser, width = 1440): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, baseURL: ORIGIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() }, reducedMotion: "reduce" });
  return { ctx, page: await ctx.newPage() };
}
const api = async (r: APIRequestContext, path: string, data: unknown, method: "post" | "patch" = "post") => r[method](`${ORIGIN}${path}`, { data, headers: H });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let ownerPage: Page;
let ownerCtx: BrowserContext;
test.describe.configure({ mode: "serial" });
test.beforeAll(async ({ browser }) => {
  const p = await newPerson(browser);
  ownerCtx = p.ctx;
  ownerPage = p.page;
  await signUp(ownerPage, "Dueño E2E", OWNER);
  // Dólar manual SINTÉTICO (1.500) para convertir los precios mayoristas en pesos.
  expect((await api(ownerPage.request, "/api/admin/fx", { action: "manual", rate: "1500" })).ok()).toBe(true);
});
test.afterAll(async () => { await ownerCtx?.close(); });

/** Una persona con cuenta crea un encargo (producto agotado `parcial-bundle`) y devuelve su referencia. */
async function crearEncargo(page: Page, qty = 2): Promise<string> {
  const r = await api(page.request, "/api/inquiries", { items: [{ productId: "parcial-bundle", quantity: qty, mode: "encargo" }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: key() });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).reference as string;
}
const admin = (ref: string, data: Record<string, unknown>) => api(ownerPage.request, `/api/admin/pedidos/${ref}`, { idempotencyKey: key(), ...data });

test("proveedores de Taobao: guarda, busca, sugiere en compras y permite archivar", async ({ request }) => {
  const endpoint = "/api/admin/proveedores";
  const data = { action: "create", name: "Cartas Shanghái", url: "https://item.taobao.com/item.htm?id=123", note: "Cajas japonesas", idempotencyKey: key() };
  expect((await api(request, endpoint, data)).status()).toBe(401);
  expect((await api(ownerPage.request, endpoint, { ...data, url: "https://taobao.com.ejemplo.test/" })).status()).toBe(400);
  const first = await api(ownerPage.request, endpoint, data);
  expect(first.ok(), await first.text()).toBe(true);
  expect(await (await api(ownerPage.request, endpoint, data)).json()).toEqual({ replayed: true });

  await go(ownerPage, "/admin/compras");
  await ownerPage.getByRole("link", { name: "Proveedores de Taobao", exact: true }).click();
  const list = ownerPage.getByRole("region", { name: "Proveedores guardados" });
  await list.getByRole("searchbox", { name: "Buscar por nombre, enlace o notas" }).fill("shanghai");
  await list.getByRole("button", { name: "Buscar" }).click();
  await expect(ownerPage).toHaveURL(/q=shanghai/);
  const row = ownerPage.getByTestId("proveedor-fila");
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("link", { name: /Abrir en Taobao/ })).toHaveAttribute("href", data.url);
  await row.getByText("Editar proveedor", { exact: true }).click();
  await row.getByLabel("Notas internas").fill("También vende cajas chinas");
  await row.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(row.getByText("También vende cajas chinas", { exact: true })).toBeVisible();

  await row.getByRole("link", { name: "Ver productos y cotizaciones" }).click();
  await expect(ownerPage.getByRole("region", { name: "Notas del proveedor" })).toContainText("También vende cajas chinas");
  const quotesEndpoint = "/api/admin/proveedores/cotizaciones";
  expect((await api(request, quotesEndpoint, {})).status()).toBe(401);
  expect((await api(request, "/api/admin/proveedores/cotizacion-rmb", {})).status()).toBe(401);
  await ownerPage.setViewportSize({ width: 360, height: 900 });
  await ownerPage.getByRole("link", { name: /Nueva cotización/ }).click();
  const quoteForm = ownerPage.getByRole("region", { name: "Nueva cotización" });
  await quoteForm.getByLabel("Nombre de la publicación").fill("Storm Emeralda del proveedor");
  await quoteForm.getByLabel("Enlace de Taobao o Tmall").fill("https://detail.tmall.com/item.htm?id=456&skuId=789");
  await quoteForm.getByLabel("Notas de esta publicación").fill("Confirmó film de fábrica");
  await quoteForm.getByLabel("RMB por 1 USD").fill("7,0000");
  await quoteForm.getByText("Pegar una lista de variantes").click();
  await quoteForm.getByPlaceholder(/Caja de 30 sobres/).fill("Caja M6 | ¥375\nSobre M6\t15 RMB");
  await quoteForm.getByRole("button", { name: "Agregar variantes de la lista" }).click();
  const box = quoteForm.getByRole("group", { name: "Variante 1", exact: true });
  await box.getByLabel("Envío y aduana").fill("22,58");
  await expect(box).toContainText("USD 53,57");
  await expect(box).toContainText("USD 76,15");
  await box.getByLabel("Foto de la variante").setInputFiles({
    name: "caja.png", mimeType: "image/png",
    buffer: await sharp({ create: { width: 120, height: 80, channels: 3, background: "#126C58" } }).png().toBuffer(),
  });
  await expect(box.getByRole("img", { name: "Caja M6" })).toBeVisible();
  expect(await overflow(ownerPage)).toBe(0);
  await quoteForm.getByRole("button", { name: "Guardar cotización" }).click();
  const listing = ownerPage.getByRole("article").filter({ hasText: "Storm Emeralda del proveedor" });
  await expect(listing).toContainText("Confirmó film de fábrica");
  await expect(listing).toContainText("RMB 375,00 · USD 53,57");
  await expect(listing).toContainText("RMB 15,00 · USD 2,14");
  await expect(listing.getByRole("img", { name: "Caja M6" })).toHaveJSProperty("naturalWidth", 120);
  await expect(listing.getByRole("link", { name: /Abrir publicación/ })).toHaveAttribute("href", "https://detail.tmall.com/item.htm?id=456&skuId=789");
  await listing.getByRole("link", { name: "Editar cotización" }).click();
  const editor = ownerPage.getByRole("region", { name: "Editar cotización" });
  await editor.getByLabel("Notas de esta publicación").fill("Pidió confirmar el precio");
  await editor.getByRole("button", { name: "Guardar cotización" }).click();
  await expect(listing).toContainText("Pidió confirmar el precio");
  await expect(listing.getByRole("img", { name: "Caja M6" })).toBeVisible();
  await ownerPage.setViewportSize({ width: 1440, height: 900 });

  await go(ownerPage, "/admin/compras?nueva=1");
  const supplier = ownerPage.getByLabel("Proveedor", { exact: true }).first();
  await expect(supplier).toHaveAttribute("list", /.+/);
  await expect(ownerPage.locator("datalist option")).toHaveAttribute("value", data.name);
  await go(ownerPage, "/admin/proveedores");
  ownerPage.once("dialog", (dialog) => void dialog.accept());
  await row.getByRole("button", { name: "Archivar proveedor" }).click();
  await expect(row).toHaveCount(0);
  await go(ownerPage, "/admin/proveedores?estado=archivados");
  await expect(row).toContainText(data.name);
  await row.getByRole("button", { name: "Restaurar proveedor" }).click();
  await expect(row).toHaveCount(0);
});

test("notificaciones del dueño: una venta suma un aviso, se abre el detalle y la lectura persiste", async ({ request }) => {
  const endpoint = "/api/admin/notificaciones";
  expect((await request.get(`${ORIGIN}${endpoint}`)).status()).toBe(401);
  expect((await api(request, endpoint, { keys: ["venta:VT-AAAAAAAA"] })).status()).toBe(401);
  await go(ownerPage, "/admin/ventas");
  const link = ownerPage.getByRole("link", { name: /^Notificaciones/ });
  await expect(link).toBeVisible();
  await expect(ownerPage.getByTestId("notificaciones-contador")).toHaveCount(0);
  await ownerPage.getByTestId("form-venta").getByRole("searchbox").fill("storm");
  await ownerPage.getByTestId("agregar-venta-storm-caja").click();
  await ownerPage.getByTestId("venta-precio-storm-caja").fill("7500");
  await ownerPage.getByTestId("venta-pago").selectOption("efectivo");
  await ownerPage.getByTestId("revisar-venta").click();
  await ownerPage.getByTestId("confirmar-venta").click();
  const done = ownerPage.getByTestId("venta-registrada");
  await expect(done).toBeVisible();
  const id = (await done.innerText()).match(/VT-[A-Z0-9]{8}/)![0];
  await expect(ownerPage.getByTestId("notificaciones-contador")).toHaveText("1");

  await link.click();
  const row = ownerPage.getByTestId("notificacion").filter({ hasText: id });
  await expect(row).toContainText("Sin leer");
  await row.getByRole("link", { name: "Venta registrada" }).click();
  await expect(ownerPage.getByRole("heading", { name: "Detalle de la venta" })).toBeVisible();
  await expect(ownerPage.getByTestId(`venta-${id}`)).toContainText("7.500");
  await link.click();
  await ownerPage.setViewportSize({ width: 360, height: 800 });
  await row.getByRole("button", { name: "Marcar como leída" }).click();
  await expect(ownerPage.getByTestId("notificaciones-contador")).toHaveCount(0);
  await expect(row.getByRole("button")).toHaveCount(0);
  expect(await overflow(ownerPage)).toBe(0);
  await ownerPage.getByRole("link", { name: "Sin leer", exact: true }).click();
  await expect(ownerPage).toHaveURL(/\/admin\/notificaciones\?estado=sin-leer$/);
  await ownerPage.reload();
  await expect(ownerPage.getByText("Estás al día. No hay notificaciones sin leer.")).toBeVisible();
  await ownerPage.setViewportSize({ width: 1440, height: 900 });
});

test("encargo de punta a punta: seguimiento, pago separado, comprobante privado y aislamiento entre personas", async ({ page, browser }) => {
  const ana = newEmail("ana");
  await signUp(page, "Ana Pérez", ana);
  await go(page, "/");
  const ref = await crearEncargo(page);

  // El dueño abre el seguimiento, confirma el importe y la etapa desde el panel (formularios reales).
  await go(ownerPage, `/admin/pedidos/${ref}`);
  // El encargo nace con su seguimiento abierto en «Solicitud recibida».
  await expect(ownerPage.getByTestId("admin-etapa-actual")).toHaveText("Solicitud recibida");
  const importe = ownerPage.getByTestId("form-importe");
  await importe.getByLabel(/Importe acordado/).fill("100.000");
  await importe.getByRole("button", { name: "Guardar importe" }).click();
  await expect(importe.getByRole("status")).toHaveText("Importe guardado.");
  // Un importe guardado sin confirmar disponibilidad no habilita todavía la transferencia.
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(page.getByTestId("datos-transferencia")).toHaveCount(0);
  await expect(page.getByTestId("accion-pedido")).toContainText("Todavía no hace falta pagar");
  const etapa = ownerPage.getByTestId("form-etapa");
  await etapa.getByLabel(/Nueva etapa/).selectOption("confirmado_tienda");
  await etapa.getByRole("button", { name: "Guardar etapa" }).click();
  await expect(etapa.getByRole("status")).toHaveText("Etapa guardada.");

  // La clienta ve el seguimiento, el importe acordado y la acción que corresponde, SIN tablero de deuda.
  await go(page, `/cuenta/consultas/${ref}`);
  const seg = page.getByTestId("seguimiento");
  await expect(seg.getByTestId("etapa-actual")).toHaveText("Producto, disponibilidad e importe confirmados por la tienda");
  await expect(seg.getByTestId("importe-acordado")).toContainText("100.000");
  await expect(seg.getByTestId("accion-pedido")).toContainText("seña del 20%");
  await expect(seg.getByTestId("importe-sena")).toContainText("20.000");
  await expect(seg.getByTestId("importe-transferir")).toContainText("20.000");
  await expect(seg.getByTestId("alias-transferencia")).toHaveText("vasconcelotiago");
  await expect(seg.getByTestId("datos-transferencia")).toContainText("Tiago Vasconcelo Marostica");
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await overflow(page)).toBeLessThanOrEqual(1);
    await expect(seg.getByTestId("alias-transferencia")).toBeVisible();
    await expect(seg.getByRole("button", { name: "Subir comprobante" })).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(seg).not.toContainText(/saldo pendiente|deuda|debés/i);
  await expect(seg.getByTestId("consultar-whatsapp")).toHaveAttribute("href", new RegExp(`wa\\.me/5491155550000\\?text=.*${ref}`));
  await expect(seg.getByTestId("referencia-pedido")).toHaveText(ref);

  // Sube un comprobante: queda en revisión y NO confirma el pago.
  await seg.locator("#comprobante-archivo").setInputFiles({ name: "transferencia.pdf", mimeType: "application/pdf", buffer: PDF });
  await seg.getByLabel(/Importe transferido/).fill("20.000");
  await seg.getByRole("button", { name: "Subir comprobante" }).click();
  await expect(seg.getByTestId("comprobante-mensaje")).toContainText("Queda en revisión");
  await expect(seg.getByTestId("estado-pago")).toHaveText("Comprobante en revisión");
  await expect(seg.getByTestId("datos-transferencia")).toHaveCount(0);
  await expect(seg.getByTestId("accion-pedido")).toContainText("no vuelvas a transferir");
  await expect(seg.getByTestId("bloque-pago")).not.toContainText("Pago completo");
  // Subir exactamente el mismo archivo otra vez no lo duplica.
  const dupe = await page.request.post(`${ORIGIN}/api/pedidos/${ref}/comprobantes`, { multipart: { file: { name: "otra.pdf", mimeType: "application/pdf", buffer: PDF } }, headers: H });
  expect(dupe.status()).toBe(200);
  expect((await dupe.json()).duplicate).toBe(true);
  // Tipo falso (ejecutable renombrado) y tamaño excesivo se rechazan en el servidor.
  const fake = await page.request.post(`${ORIGIN}/api/pedidos/${ref}/comprobantes`, { multipart: { file: { name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ\x90\x00 no es un pdf") } }, headers: H });
  expect(fake.status()).toBe(415);
  const big = await page.request.post(`${ORIGIN}/api/pedidos/${ref}/comprobantes`, { multipart: { file: { name: "grande.pdf", mimeType: "application/pdf", buffer: Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(4 * 1024 * 1024 + 10)]) } }, headers: H });
  expect(big.status()).toBe(413);

  // El comprobante figura en el panel; el dueño lo descarga; ninguna otra persona puede.
  await go(ownerPage, `/admin/pedidos/${ref}`);
  const fila = ownerPage.getByTestId("comprobante-fila");
  await expect(fila).toContainText("Pendiente de revisión");
  const href = await fila.getByRole("link", { name: "Abrir" }).getAttribute("href");
  const rid = href!.split("/").pop()!;
  const own = await ownerPage.request.get(`${ORIGIN}${href}`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toBe("application/pdf");
  expect(own.headers()["cache-control"]).toMatch(/private/);
  expect(own.headers()["x-content-type-options"]).toBe("nosniff");
  const mine = await page.request.get(`${ORIGIN}/api/comprobantes/${rid}`);
  expect(mine.status()).toBe(200);
  const beto = await newPerson(browser);
  await signUp(beto.page, "Beto Ruiz", newEmail("beto"));
  expect((await beto.page.request.get(`${ORIGIN}/api/comprobantes/${rid}`)).status()).toBe(404); // otra cuenta
  expect((await beto.page.request.get(`${ORIGIN}/cuenta/consultas/${ref}`)).status()).toBe(404); // ni el pedido
  expect((await beto.page.request.get(`${ORIGIN}/seguimiento/${ref}`)).status()).toBe(404);
  expect((await beto.page.request.post(`${ORIGIN}/api/pedidos/${ref}/comprobantes`, { multipart: { file: { name: "x.pdf", mimeType: "application/pdf", buffer: PDF } }, headers: H })).status()).toBe(404);
  const anon = await newPerson(browser);
  expect((await anon.page.request.get(`${ORIGIN}/api/comprobantes/${rid}`)).status()).toBe(404); // sin sesión
  expect((await anon.page.request.get(`${ORIGIN}/api/comprobantes/${rid}?k=${"a".repeat(30)}`)).status()).toBe(404); // enlace inventado
  // Un cliente tampoco puede usar las operaciones del panel.
  expect((await api(beto.page.request, `/api/admin/pedidos/${ref}`, { action: "payment" })).status()).toBe(403);
  expect((await api(anon.page.request, `/api/admin/pedidos/${ref}`, { action: "payment" })).status()).toBe(401);
  await beto.ctx.close();
  await anon.ctx.close();

  // El dueño confirma el ingreso: recién ahí figura el pago; la etapa de la seña queda registrada y el pago NO mueve la logística por sí solo más allá de eso.
  const pago = ownerPage.getByTestId("form-pago");
  await pago.getByLabel(/Tipo/).selectOption("sena");
  await pago.getByLabel(/^Importe/).fill("20.000");
  await pago.getByLabel(/Comprobante que respalda/).selectOption({ index: 1 });
  await pago.getByRole("button", { name: "Confirmar ingreso" }).click();
  await expect(pago.getByRole("status")).toHaveText("Ingreso confirmado.");
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(page.getByTestId("estado-pago")).toHaveText("Pago parcial confirmado");
  await expect(page.getByTestId("etapa-actual")).toHaveText("Seña del 20% confirmada");
  await expect(page.getByTestId("importe-sena")).toContainText("20.000");
  await expect(page.getByTestId("datos-transferencia")).toHaveCount(0);
  await expect(page.getByTestId("bloque-comprobantes")).toContainText("Aceptado");
  // Un aviso por correo quedó registrado para la cuenta (transporte LOCAL de pruebas: no sale a ningún cliente real).
  const sent = fs.readdirSync(MAIL_DIR).map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")) as { to: string; kind: string; subject: string }).filter((m) => m.to === ana && m.kind === "aviso");
  expect(sent.map((m) => m.subject)).toContain("Confirmamos tu pago");

  // Accesibilidad de la vista de la clienta.
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(a11y.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
});

test("pedido de un invitado: solo con su navegador o con el enlace privado que genera el dueño; las notas internas nunca se ven", async ({ page, browser }) => {
  await go(page, "/");
  const ref = await crearEncargo(page, 1); // sin cuenta
  await admin(ref, { action: "open" });
  await admin(ref, { action: "note", publicText: "Estamos coordinando con el proveedor.", internalText: "NOTA-INTERNA-SECRETA costo 12 RMB" });
  await go(page, `/carrito/consulta/${ref}`);
  await expect(page.getByTestId("seguimiento")).toContainText("Estamos coordinando con el proveedor.");
  await expect(page.locator("body")).not.toContainText("NOTA-INTERNA-SECRETA");
  // Otro navegador conociendo la referencia NO entra.
  const otro = await newPerson(browser);
  expect((await otro.page.request.get(`${ORIGIN}/carrito/consulta/${ref}`)).status()).toBe(404);
  expect((await otro.page.request.get(`${ORIGIN}/seguimiento/${ref}`)).status()).toBe(404);
  // El dueño genera el enlace privado; con él sí entra, y un enlace equivocado no.
  await go(ownerPage, `/admin/pedidos/${ref}`);
  ownerPage.once("dialog", (d) => void d.accept());
  await ownerPage.getByTestId("generar-enlace").click();
  const url = await ownerPage.locator("#enlace-privado").inputValue();
  expect(url).toMatch(new RegExp(`/seguimiento/${ref}\\?k=`));
  await go(otro.page, url);
  await expect(otro.page.getByTestId("seguimiento")).toBeVisible();
  await expect(otro.page.locator("body")).not.toContainText("NOTA-INTERNA-SECRETA");
  expect((await otro.page.request.get(`${ORIGIN}/seguimiento/${ref}?k=${"b".repeat(32)}`)).status()).toBe(404);
  await otro.ctx.close();
});

test("«Avisame cuando vuelva»: consentimiento, sin duplicados, cancelación y conteo en el panel", async ({ page }) => {
  await go(page, "/productos/set-parcial-de-ejemplo-bundle");
  const box = page.getByTestId("avisame");
  await expect(box).toBeVisible();
  const mail = newEmail("aviso");
  await box.getByLabel("Correo electrónico").fill(mail);
  await box.getByTestId("avisame-enviar").click();
  await expect(box.getByRole("alert")).toContainText("aceptar");
  await box.getByTestId("avisame-consentimiento").check();
  await box.getByTestId("avisame-enviar").click();
  await expect(box.getByTestId("avisame-listo")).toContainText("te anotamos");
  // Repetir el mismo correo no duplica (el panel cuenta uno).
  const again = await api(page.request, "/api/avisos-reposicion", { productId: "parcial-bundle", consent: true, email: mail });
  expect(again.status()).toBe(200);
  expect((await again.json()).replayed).toBe(true);
  await go(ownerPage, "/admin/reposicion");
  const n1 = Number(await ownerPage.getByTestId("reposicion-fila").filter({ hasText: "Booster bundle" }).getByTestId("reposicion-cantidad").first().innerText());
  expect(n1).toBeGreaterThanOrEqual(1);
  // Cancelar; ya no cuenta.
  await box.getByTestId("avisame-cancelar").click();
  await expect(page.getByText("Cancelamos tu aviso")).toBeVisible();
  await go(ownerPage, "/admin/reposicion");
  const filas = ownerPage.getByTestId("reposicion-fila").filter({ hasText: "Booster bundle" });
  const n2 = (await filas.count()) ? Number(await filas.getByTestId("reposicion-cantidad").first().innerText()) : 0;
  expect(n2).toBe(n1 - 1);
  // El aviso no creó ninguna consulta ni venta.
  expect((await ownerPage.request.get(`${ORIGIN}/admin/consultas`)).ok()).toBe(true);
});

test("mayorista: solicitud, tramos, pedido, seña y envío internacional", async ({ page, browser }, testInfo) => {
  test.setTimeout(90_000);
  const mail = newEmail("mayor");
  await signUp(page, "Marta Gómez", mail);
  // Sin aprobar: ni un precio mayorista en la página.
  await go(page, "/mayoristas/catalogo");
  await expect(page.getByTestId("mayorista-sin-acceso")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Precio unitario");
  await go(page, "/mayoristas/solicitar");
  const solicitud = page.getByTestId("form-mayorista");
  await solicitud.getByLabel(/Nombre comercial/).fill("Kiosco Marta");
  await solicitud.getByLabel("Localidad").fill("Haedo");
  await solicitud.getByLabel("Provincia").selectOption("Buenos Aires");
  await solicitud.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(page.getByTestId("solicitud-guardada")).toBeVisible();
  const solicitudRef = (await page.getByTestId("estado-mayorista").textContent())!.match(/MY-[A-Z2-9]{8}/)![0];
  await go(ownerPage, "/admin");
  const pendientes = ownerPage.getByRole("link", { name: /Solicitudes mayoristas pendientes/ });
  await expect(pendientes).toContainText("Revisar solicitudes");
  await pendientes.click();
  // El dueño define tramos y condiciones (DATOS FICTICIOS DE PRUEBA, no condiciones reales).
  const fila = ownerPage.getByTestId("mayorista-fila").filter({ hasText: "Kiosco Marta" });
  await expect(fila).toContainText(solicitudRef);
  ownerPage.once("dialog", (d) => void d.accept());
  await fila.getByRole("button", { name: "Aprobar cuenta" }).click();
  // Al guardar, el panel se vuelve a dibujar y la fila pasa a «Aprobada».
  await expect(fila).toContainText("Aprobada");
  // Aprobada pero con el catálogo cerrado (condiciones sin definir): sigue sin precios.
  await go(page, "/mayoristas/catalogo");
  await expect(page.getByTestId("mayorista-sin-acceso")).toContainText("todavía no está habilitado");
  const pricesPage = await ownerPage.context().newPage();
  await go(pricesPage, "/admin/mayoristas");
  await pricesPage.getByRole("link", { name: "Editar precios mayoristas" }).click();
  await pricesPage.setViewportSize({ width: 360, height: 800 });
  const search = pricesPage.getByRole("search");
  await search.getByRole("searchbox", { name: "Producto o SKU" }).fill("storm");
  await search.getByRole("button", { name: "Buscar" }).click();
  const tramos = pricesPage.getByTestId("mayorista-precio-storm-sobre").getByTestId("mayorista-en-producto");
  await tramos.locator("summary").click();
  for (const [cantidad, precio] of [["10", "10"], ["50", "8"]]) {
    await tramos.getByLabel(/Desde unidades mayoristas/).fill(cantidad);
    await tramos.getByLabel(/Nuevo precio mayorista/).fill(precio);
    await tramos.getByRole("button", { name: "Guardar borrador" }).click();
    await expect(tramos.getByRole("status")).toContainText("Tramo guardado como borrador.");
  }
  await tramos.locator("summary").click();
  const priceRow = pricesPage.getByTestId("mayorista-precio-storm-sobre");
  const quickPrice = priceRow.getByRole("textbox", { name: /Precio base mayorista/ });
  for (const amount of ["11", "10"]) {
    await quickPrice.fill(amount);
    await priceRow.getByRole("button", { name: "Guardar precio base" }).click();
    await expect(priceRow.getByRole("status")).toContainText("Tramo guardado como borrador.");
  }
  await tramos.locator("summary").click();
  await expect(tramos.getByLabel(/Precio mayorista desde 50/)).toHaveValue(/8/);
  expect(await pricesPage.evaluate(() => document.documentElement.scrollWidth)).toBe(360);

  const reglas = ownerPage.getByTestId("form-reglas");
  await reglas.getByLabel("Compra mínima (cajas)").fill("");
  await reglas.getByLabel("Compra mínima (unidades)").fill("10");
  await reglas.getByLabel(/Se combinan productos/).selectOption("producto");
  await reglas.getByLabel("Demora estimada").fill("Entre 30 y 60 días (dato ficticio)");
  await reglas.getByLabel(/Se cuenta desde/).fill("la confirmación de la seña");
  await reglas.getByLabel(/Plazo de reintegro/).fill("Plazo ficticio de prueba");
  await reglas.getByLabel(/Condiciones de cancelación/).fill("Condición ficticia de prueba");
  const guardar = reglas.getByRole("button", { name: "Guardar condiciones" });
  await guardar.click();
  await expect(reglas.getByRole("status")).toHaveText("Condiciones guardadas.");
  await expect(ownerPage.getByRole("button", { name: "Habilitar catálogo mayorista" })).toHaveCount(0);
  const blocked = await api(ownerPage.request, "/api/admin/mayorista", { action: "catalog_access", open: true });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).error.message).toContain("tramo");

  await tramos.getByRole("button", { name: "Publicar precios mayoristas" }).click();
  await expect(tramos.getByText("Publicado", { exact: true })).toHaveCount(2);
  await expect(pricesPage.locator('li[data-testid^="mayorista-precio-"]').first()).toHaveAttribute("data-testid", "mayorista-precio-storm-sobre");
  await pricesPage.close();
  await ownerPage.reload();
  await ownerPage.getByRole("button", { name: "Habilitar catálogo mayorista" }).click();
  await expect(ownerPage.getByTestId("estado-catalogo-mayorista")).toContainText("ABIERTO");

  await go(page, "/mayoristas/catalogo");
  const tabla = page.getByTestId("tabla-mayorista");
  await expect(tabla).toBeVisible();
  const fp = page.getByTestId("fila-mayorista").filter({ has: page.locator("#qty-storm-sobre") });
  await fp.getByLabel(/Cantidad de/).fill("5");
  await expect(fp.getByTestId("precio-unitario")).toHaveText("A cotizar · desde 10 unidades"); // no llega al primer tramo
  await expect(page.getByTestId("problemas-pedido")).toContainText("compra mínima");
  await fp.getByLabel(/Cantidad de/).fill("50");
  await expect(fp.getByTestId("precio-unitario")).toContainText("12.000");
  await expect(page.getByTestId("total-pedido")).toContainText("600.000"); // 50 u. × $12.000
  // Nombre largo y precio grande configurados por el dueño, siempre en la base descartable.
  const renamed = await api(ownerPage.request, "/api/admin/products/storm-sobre", { title: "Edición mayorista de prueba con nombre muy largo " + "ColeccionEspecial".repeat(6), expectedVersion: 0 }, "patch");
  expect(renamed.ok(), await renamed.text()).toBe(true);
  const version = (await renamed.json()).version as number;
  expect((await api(ownerPage.request, "/api/admin/mayorista", { action: "tier", productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 9_999_999 })).ok()).toBe(true);
  expect((await api(ownerPage.request, "/api/admin/mayorista", { action: "tier", productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 9_999_998 })).ok()).toBe(true);
  expect((await api(ownerPage.request, "/api/admin/mayorista", { action: "publish", productId: "storm-sobre" })).ok()).toBe(true);
  await go(page, "/mayoristas/catalogo");
  await fp.getByLabel(/Cantidad de/).fill("50");
  // Preservamos evidencia de la reproducción antes de corregir (546/390 en este fixture).
  // Regresión: cuenta realmente aprobada, catálogo abierto y cantidades distintas de cero.
  for (const width of [390, 360, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(fp.getByLabel(/Cantidad de/)).toHaveValue("50");
    for (const qty of ["1", "10", "50", "100000"]) {
      await fp.getByLabel(/Cantidad de/).fill(qty);
      await expect(fp.getByLabel(/Cantidad de/)).toHaveValue(qty);
      expect(await overflow(page), `${width}px, cantidad ${qty}`).toBeLessThanOrEqual(0);
    }
    await fp.getByLabel(/Cantidad de/).fill("51");
    await expect(fp.getByLabel(/Cantidad de/)).toHaveValue("51");
    await fp.getByLabel(/Cantidad de/).fill("50");
    for (const control of [fp.getByLabel(/Cantidad de/), page.getByLabel("Buscar", { exact: true }), page.getByLabel("Nombre y apellido"), page.getByTestId("enviar-pedido-mayorista")]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    if (width < 1024) {
      const titleBox = await fp.locator("th").boundingBox();
      expect(titleBox!.width, "El nombre debe ocupar el ancho de la tarjeta, sin quedar en una columna angosta").toBeGreaterThan(width - 84);
    }
    const geometry = await page.evaluate(() => ({
      viewport: innerWidth, document: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 15).map((el) => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })),
    }));
    await test.info().attach(`catalogo-${width}-geometria`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
    await page.screenshot({ path: testInfo.outputPath(`mayorista-regresion-${width}.png`), fullPage: true });
    expect(geometry.document, JSON.stringify(geometry)).toBeLessThanOrEqual(width);
  }
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(a11y.violations.map((v) => v.id)).toEqual([]);
  // Volver a los importes pequeños antes de enviar el pedido de prueba.
  expect((await api(ownerPage.request, "/api/admin/products/storm-sobre", { title: null, expectedVersion: version }, "patch")).ok()).toBe(true);
  await api(ownerPage.request, "/api/admin/mayorista", { action: "tier", productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 1000 });
  await api(ownerPage.request, "/api/admin/mayorista", { action: "tier", productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 800 });
  await api(ownerPage.request, "/api/admin/mayorista", { action: "publish", productId: "storm-sobre" });
  await go(page, "/mayoristas/catalogo");
  await fp.getByLabel(/Cantidad de/).fill("50");
  await page.getByTestId("enviar-pedido-mayorista").click();
  await expect(page.getByTestId("pedido-mayorista-enviado")).toBeVisible();
  const ref = (await page.getByTestId("pedido-mayorista-enviado").innerText()).match(/TT-[A-Z0-9]{8}/)![0];
  // Es un pedido del sistema de seguimiento, en «Solicitud recibida», sin descuentos minoristas.
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(page.getByTestId("etapa-actual")).toHaveText("Solicitud recibida");
  await expect(page.locator("body")).not.toContainText("10% OFF");
  // El servidor ignora lo que mande el navegador: otra persona sin aprobar no puede pedir ni ver precios.
  const otra = await newPerson(browser);
  await signUp(otra.page, "Pedro Sin Cuenta", newEmail("pedro"));
  expect((await api(otra.page.request, "/api/mayoristas/pedido", { lines: [{ productId: "storm-sobre", quantity: 50 }], contactName: "Pedro Pérez", idempotencyKey: key() })).status()).toBe(403);
  await go(otra.page, "/mayoristas/catalogo");
  await expect(otra.page.locator("body")).not.toContainText("USD 8,00");
  await otra.ctx.close();

  await go(ownerPage, `/admin/pedidos/${ref}`);
  await ownerPage.getByRole("link", { name: "Registrar seña", exact: true }).click();
  await expect(ownerPage).toHaveURL(/#admin-pago$/);
  const pagos = ownerPage.getByTestId("admin-pago");
  await expect(pagos.getByText("Primero guardá el total acordado.", { exact: false })).toBeVisible();
  await expect(pagos.getByTestId("form-pago")).toHaveCount(0);
  await ownerPage.getByText("Acordé el importe en pesos", { exact: true }).click();
  const importe = ownerPage.getByTestId("form-importe");
  await importe.getByLabel(/Importe acordado/).fill("600.000");
  await importe.getByRole("button", { name: "Guardar importe" }).click();
  await expect(ownerPage.getByTestId("mayorista-saldo")).toContainText("600.000");
  await expect(pagos.getByTestId("form-pago").getByLabel("Tipo")).toHaveValue("sena");
  const etapa = ownerPage.getByTestId("form-etapa");
  await etapa.getByLabel(/Nueva etapa/).selectOption("confirmado_tienda");
  await etapa.getByRole("button", { name: "Guardar etapa" }).click();
  await expect(ownerPage.getByTestId("admin-etapa-actual")).toContainText("confirmados por la tienda");

  await go(page, `/cuenta/consultas/${ref}`);
  const seg = page.getByTestId("seguimiento");
  await expect(seg.getByTestId("importe-transferir")).toContainText("120.000");
  await expect(seg.getByTestId("alias-transferencia")).toHaveText("vasconcelotiago");
  await seg.locator("#comprobante-archivo").setInputFiles({ name: "sena-mayorista.pdf", mimeType: "application/pdf", buffer: PDF });
  await seg.getByLabel(/Importe transferido/).fill("120.000");
  await seg.getByRole("button", { name: "Subir comprobante" }).click();
  await expect(seg.getByTestId("estado-pago")).toHaveText("Comprobante en revisión");

  await go(ownerPage, `/admin/pedidos/${ref}`);
  const pago = ownerPage.getByTestId("form-pago");
  await pago.getByLabel(/Tipo/).selectOption("sena");
  await pago.getByLabel(/^Importe/).fill("120.000");
  await pago.getByLabel(/Comprobante que respalda/).selectOption({ index: 1 });
  await pago.getByRole("button", { name: "Confirmar ingreso" }).click();
  await expect(pago.getByRole("status")).toHaveText("Ingreso confirmado.");
  await expect(ownerPage.getByTestId("mayorista-pagado")).toContainText("120.000");
  await expect(ownerPage.getByTestId("mayorista-saldo")).toContainText("480.000");
  const purchased = await admin(ref, { action: "stage", stage: "comprado_proveedor", occurredAt: Date.now() });
  expect(purchased.ok(), await purchased.text()).toBe(true);

  const envio = (data: Record<string, unknown>) => api(ownerPage.request, "/api/admin/envios", { idempotencyKey: key(), ...data });
  const created = await envio({ action: "create", label: "Envío mayorista ficticio" });
  expect(created.ok(), await created.text()).toBe(true);
  const { id: shipmentId } = await created.json();
  const other = await envio({ action: "create", label: "Otro envío ficticio" });
  expect(other.ok(), await other.text()).toBe(true);
  await go(ownerPage, "/admin/envios");
  const shipment = ownerPage.getByTestId("envio").filter({ hasText: shipmentId });
  const article = shipment.getByRole("combobox", { name: /^Artículo\s*\*$/ });
  const lineId = await article.locator("option").filter({ hasText: ref }).getAttribute("value");
  await article.selectOption(lineId!);
  await shipment.getByLabel(/Cantidad en este envío/).fill("50");
  await shipment.getByRole("button", { name: "Sumar al envío" }).click();
  await expect(shipment.getByTestId("envio-item")).toContainText(ref);
  for (const status of ["enviado_proveedor", "recibido_origen", "en_transito"]) {
    const updated = await envio({ action: "status", shipmentId, status, occurredAt: Date.now() });
    expect(updated.ok(), await updated.text()).toBe(true);
  }
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(seg.getByTestId("etapa-actual")).toHaveText("En tránsito a Argentina");
  await expect(seg.getByTestId("saldo-pedido")).toContainText("480.000");
  await expect(seg.getByTestId("datos-transferencia")).toHaveCount(0);
  const arrived = await envio({ action: "status", shipmentId, status: "recibido_argentina", occurredAt: Date.now() });
  expect(arrived.ok(), await arrived.text()).toBe(true);
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(seg.getByTestId("etapa-actual")).toHaveText("Recibido en Argentina");
  await expect(seg.getByTestId("importe-transferir")).toContainText("480.000");
});

test("costos y ganancia son privados: ni clientes ni anónimos acceden", async ({ page, browser }) => {
  await signUp(page, "Clienta Común", newEmail("comun"));
  for (const url of ["/admin/costos", "/admin/pedidos", "/admin/envios", "/admin/mayoristas", "/admin/precios-mayoristas"]) expect((await page.request.get(`${ORIGIN}${url}`)).status(), url).toBe(404);
  expect((await api(page.request, "/api/admin/costos", { action: "commission" })).status()).toBe(403);
  const anon = await newPerson(browser);
  expect((await api(anon.page.request, "/api/admin/costos", { action: "commission" })).status()).toBe(401);
  expect((await api(anon.page.request, "/api/admin/mayorista", { action: "tier" })).status()).toBe(401);
  await anon.ctx.close();
  // El dueño sí ve su panel de costos.
  await go(ownerPage, "/admin/costos");
  await expect(ownerPage.getByTestId("ganancia")).toBeVisible();
  // Una página pública no contiene datos de costos ni de proveedores.
  const html = await (await page.request.get(`${ORIGIN}/productos/storm-sobre`)).text();
  expect(html).not.toMatch(/Costo pendiente|costo final|proveedor de prueba|applied_costs/i);
});

for (const width of [360, 390, 430]) {
  test(`móvil ${width}px: sin desborde horizontal en seguimiento, mayorista, avisos y panel`, async ({ browser }) => {
    const { ctx, page } = await newPerson(browser, width);
    await signUp(page, "Lucía Móvil", newEmail(`movil${width}`));
    await go(page, "/");
    const ref = await crearEncargo(page);
    await admin(ref, { action: "open" });
    await admin(ref, { action: "agreed", agreedMinor: 5_000_000 });
    for (const url of [`/cuenta/consultas/${ref}`, "/mayoristas", "/mayoristas/catalogo", "/cuenta/avisos", "/productos/set-parcial-de-ejemplo-bundle"]) {
      await go(page, url);
      expect(await overflow(page), `${url} a ${width}px`).toBeLessThanOrEqual(0);
    }
    await ctx.close();
    // Panel del dueño en el mismo ancho.
    const o = await newPerson(browser, width);
    await o.ctx.addCookies(await ownerCtx.cookies());
    for (const url of [`/admin/pedidos/${ref}`, "/admin/pedidos", "/admin/envios", "/admin/costos", "/admin/mayoristas", "/admin/reposicion", "/admin/avisos"]) {
      await go(o.page, url);
      expect(await overflow(o.page), `${url} a ${width}px`).toBeLessThanOrEqual(0);
    }
    await o.ctx.close();
  });
}

test("accesibilidad: panel y catálogo mayorista sin violaciones de WCAG A/AA", async ({ page }) => {
  for (const url of ["/admin/pedidos", "/admin/envios", "/admin/costos", "/admin/mayoristas", "/admin/reposicion", "/admin/avisos"]) {
    await go(ownerPage, url);
    const r = await new AxeBuilder({ page: ownerPage }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${url} ${v.id}: ${v.nodes[0]?.html.slice(0, 120)}`), url).toEqual([]);
  }
  await go(page, "/mayoristas");
  const m = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(m.violations.map((v) => v.id)).toEqual([]);
});
