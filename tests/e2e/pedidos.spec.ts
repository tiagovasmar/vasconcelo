import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
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
  // El dueño define tramos y condiciones (DATOS FICTICIOS DE PRUEBA, no condiciones reales).
  await go(ownerPage, "/admin/mayoristas");
  const fila = ownerPage.getByTestId("mayorista-fila").filter({ hasText: "Kiosco Marta" });
  ownerPage.once("dialog", (d) => void d.accept());
  await fila.getByRole("button", { name: "Aprobar cuenta" }).click();
  // Al guardar, el panel se vuelve a dibujar y la fila pasa a «Aprobada».
  await expect(fila).toContainText("Aprobada");
  // Aprobada pero con el catálogo cerrado (condiciones sin definir): sigue sin precios.
  await go(page, "/mayoristas/catalogo");
  await expect(page.getByTestId("mayorista-sin-acceso")).toContainText("todavía no está habilitado");
  const tramos = ownerPage.getByTestId("form-tramo");
  for (const [cantidad, precio] of [["10", "10"], ["50", "8"]]) {
    await tramos.getByLabel("Producto").selectOption("storm-sobre");
    await tramos.getByLabel("Desde (unidades)").fill(cantidad);
    await tramos.getByLabel("Precio unitario (USD)").fill(precio);
    await tramos.getByRole("button", { name: "Guardar tramo (borrador)" }).click();
    await expect(tramos.getByRole("status")).toHaveText("Tramo guardado como borrador.");
  }

  const reglas = ownerPage.getByTestId("form-reglas");
  await reglas.getByLabel("Compra mínima (cajas)").fill("");
  await reglas.getByLabel("Compra mínima (unidades)").fill("10");
  await reglas.getByLabel(/Se combinan productos/).selectOption("producto");
  await reglas.getByLabel("Demora estimada").fill("Entre 30 y 60 días (dato ficticio)");
  await reglas.getByLabel(/Se cuenta desde/).fill("la confirmación de la seña");
  await reglas.getByLabel(/Plazo de reintegro/).fill("Plazo ficticio de prueba");
  await reglas.getByLabel(/Condiciones de cancelación/).fill("Condición ficticia de prueba");
  await reglas.getByRole("checkbox").check();
  const guardar = reglas.getByRole("button", { name: "Guardar condiciones" });
  await guardar.click();
  await expect(reglas.getByRole("alert")).toContainText(/tramo/i);

  ownerPage.once("dialog", (d) => void d.accept());
  await ownerPage.getByRole("button", { name: "Revisé los precios: publicar" }).click();
  await expect(ownerPage.getByTestId("tramos-producto").getByTestId("tramo").filter({ hasText: "Publicado" })).toHaveCount(2);
  await guardar.click();
  await expect(reglas.getByRole("status")).toHaveText("Condiciones guardadas.");
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
  const importe = ownerPage.getByTestId("form-importe");
  await importe.getByLabel(/Importe acordado/).fill("600.000");
  await importe.getByRole("button", { name: "Guardar importe" }).click();
  await expect(importe.getByRole("status")).toHaveText("Importe guardado.");
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
  await expect(seg.getByTestId("datos-transferencia")).toHaveCount(0);
  const arrived = await envio({ action: "status", shipmentId, status: "recibido_argentina", occurredAt: Date.now() });
  expect(arrived.ok(), await arrived.text()).toBe(true);
  await go(page, `/cuenta/consultas/${ref}`);
  await expect(seg.getByTestId("etapa-actual")).toHaveText("Recibido en Argentina");
  await expect(seg.getByTestId("importe-transferir")).toContainText("480.000");
});

test("costos y ganancia son privados: ni clientes ni anónimos acceden", async ({ page, browser }) => {
  await signUp(page, "Clienta Común", newEmail("comun"));
  for (const url of ["/admin/costos", "/admin/pedidos", "/admin/envios", "/admin/mayoristas"]) expect((await page.request.get(`${ORIGIN}${url}`)).status(), url).toBe(404);
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
