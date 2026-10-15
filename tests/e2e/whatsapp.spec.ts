import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor con número de prueba (5491155550000): los destinos de wa.me se interceptan, nunca se envía nada real.
const KEY = "tienda-carrito-v1";
// Chromium en Windows entrega el portapapeles con CRLF: se normaliza para comparar.
const clip = async (page: Page) => (await page.evaluate(() => navigator.clipboard.readText())).split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const NUMBER = "5491155550000";

async function intercept(context: BrowserContext) {
  const hits: string[] = [];
  await context.route(/https:\/\/wa\.me\/.*/, (route) => {
    hits.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>chat interceptado</body></html>" });
  });
  return hits;
}
async function seed(page: Page, items: Array<{ productId: string; quantity: number; priceMinor: number }>, extra: Record<string, unknown> = {}) {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items, delivery: {}, payment: "efectivo", contactName: "Ana Pérez", idem: null, ...extra }]);
  await go(page, "/carrito");
}
const cta = (page: Page) => page.getByRole("button", { name: /Continuar por WhatsApp|Preparando/ });
const base = [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }, { productId: "storm-pack5", quantity: 1, priceMinor: 4200000 }];

test("con número configurado se abre el chat con el mensaje exacto y sin marcar nada como enviado", async ({ page, context }) => {
  const hits = await intercept(context);
  await seed(page, base, { contactName: "Inés Muñoz" });
  await expect(page.getByText("Se abrirá el chat con tu pedido listo. Solo tenés que enviarlo.")).toBeVisible();
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/inquiries")), cta(page).click()]);
  const json = await resp.json();
  await page.waitForURL(/https:\/\/wa\.me\//);
  const url = new URL(page.url());
  expect(url.pathname).toBe(`/${NUMBER}`);
  expect(url.searchParams.get("text")).toBe(json.message);
  expect(json.message).toContain("Hola, soy Ana Pérez.");
  expect(json.message).toContain("*Subtotal: $ 61.000*");
  expect(json.message).toContain("Envío: a coordinar");
  expect(hits.length).toBeGreaterThan(0);

  // Al volver, la consulta sigue "preparada", con enlace para reabrir y el carrito intacto
  await page.goBack();
  await expect(page.getByText("Todavía no enviaste nada.")).toBeVisible();
  await expect(page).not.toHaveURL(/abrir=1/);
  const link = page.getByTestId("abrir-whatsapp");
  expect(await link.getAttribute("href")).toBe(url.toString());
  const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
  await popup.waitForURL(/wa\.me/);
  await expect(page.getByTestId("modo-demo")).toHaveCount(0);
  await go(page, "/carrito");
  await expect(page.getByTestId("resumen-subtotal")).toContainText("61.000"); // el carrito no se vacía al abrir WhatsApp
});

test("pedido muy largo: abre el chat con resumen + referencia y ofrece copiar el detalle íntegro", async ({ page, context }) => {
  await intercept(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const ids = [["storm-sobre", 950000], ["storm-caja", 18500000], ["storm-pack5", 4200000], ["ejemplo-sobre", 1250000], ["ejemplo-caja", 21000000], ["ejemplo-pack-mixto", 5900000], ["parcial-sobre", 1100000]] as const;
  await seed(page, ids.map(([productId, priceMinor]) => ({ productId, quantity: 1, priceMinor })), { contactName: "María de los Ángeles Fernández de la Vega y Ortiz de Zárate" });
  await page.getByLabel(/^Andreani/).check();
  await page.getByLabel("Localidad").fill("Villa Gobernador Gálvez de las Tres Cañadas del Norte y Sur Argentino");
  await page.getByLabel("Provincia").selectOption("Ciudad Autónoma de Buenos Aires");
  await page.getByLabel("Código postal").fill("1704");
  const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/inquiries")), cta(page).click()]);
  const json = await resp.json();
  expect(json.whatsapp.mode).toBe("summary");
  await page.waitForURL(/https:\/\/wa\.me\//);
  const text = new URL(page.url()).searchParams.get("text")!;
  expect(text).toContain(json.reference);
  expect(text).toContain("7 productos distintos");
  expect(page.url().length).toBeLessThan(1800);
  await page.goBack();
  await expect(page.getByTestId("modo-resumen")).toBeVisible();
  for (const sku of ["DEMO-STORM-SOBRE", "DEMO-STORM-CAJA", "DEMO-STORM-PACK5", "DEMO-EJ-SOBRE", "DEMO-EJ-CAJA", "DEMO-EJ-PACKMIX", "DEMO-PAR-SOBRE"]) {
    await expect(page.getByTestId("mensaje")).toContainText(sku); // nada se trunca
  }
  await page.getByTestId("copiar-mensaje").click();
  await expect(page.getByTestId("copiado")).toHaveText("Detalle copiado. Pegalo en el chat.");
  expect(await clip(page)).toBe(json.message);
});

test("recorrido completo con número configurado: catálogo → ficha → carrito → consulta → WhatsApp", async ({ page, context }) => {
  const hits = await intercept(context);
  await page.goto("/sellados");
  await page.locator("html[data-hydrated='true']").waitFor();
  await page.getByRole("link", { name: "Storm Emeralda · Sobre" }).first().click();
  await page.locator("html[data-hydrated='true']").waitFor();
  await page.getByRole("button", { name: "Más" }).click();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await page.getByTestId("drawer-continuar").click();
  await expect(page.getByTestId("resumen-subtotal")).toContainText("19.000");
  await page.getByLabel(/^Andreani/).check();
  await page.getByLabel("Localidad").fill("Haedo");
  await page.getByLabel("Provincia").selectOption("Buenos Aires");
  await page.getByLabel("Código postal").fill("1706");
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/inquiries")), cta(page).click()]);
  const json = await resp.json();
  await page.waitForURL(/https:\/\/wa\.me\//);
  const url = new URL(page.url());
  expect(url.pathname).toBe(`/${NUMBER}`);
  expect(url.searchParams.get("text")).toBe(json.message);
  expect(json.message).toContain("2 × Storm Emeralda · Sobre [Japonés]");
  expect(json.message).toContain("Entrega: Andreani · Haedo, Buenos Aires (CP 1706)");
  expect(hits).toHaveLength(1);
});
