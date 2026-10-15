import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { go } from "./helpers";

// Accesibilidad automatizada (axe-core, WCAG 2.0/2.1 A y AA) en las pantallas principales. Detecta contraste, nombres
// accesibles, etiquetas, roles y estructura. NO reemplaza una prueba con lector de pantalla ni una revisión manual.
const KEY = "tienda-carrito-v1";
const pages: Array<[string, string]> = [
  ["inicio", "/"],
  ["catálogo", "/sellados"],
  ["catálogo filtrado", "/sellados?formato=caja&disp=stock"],
  ["sin resultados", "/sellados?q=no-existe-xyz"],
  ["ficha con lista no disponible", "/productos/storm-emeralda-caja"],
  ["ficha con lista completa", "/productos/set-de-ejemplo-sobre"],
  ["ficha pack mixto", "/productos/pack-mixto-de-ejemplo"],
  ["expansiones", "/expansiones"],
  ["expansión", "/expansiones/set-parcial-de-ejemplo"],
  ["cómo comprar", "/como-comprar"],
  ["privacidad", "/privacidad"],
  ["condiciones", "/condiciones"],
  ["cuenta (invitado)", "/cuenta"],
  ["ingresar", "/cuenta/ingresar"],
  ["registro", "/cuenta/registro"],
  ["recuperar", "/cuenta/recuperar"],
  ["restablecer (enlace inválido)", "/cuenta/restablecer"],
  ["404", "/productos/no-existe"],
];

async function audit(page: import("@playwright/test").Page) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const [name, url] of pages) {
  test(`axe: ${name}`, async ({ page }) => {
    await go(page, url);
    expect(await audit(page)).toEqual([]);
  });
}

test("axe: carrito con productos, avisos y formulario de entrega", async ({ page }) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items: [{ productId: "storm-caja", quantity: 1, priceMinor: 17000000 }, { productId: "parcial-bundle", quantity: 1, priceMinor: 6800000 }, { productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: { method: "andreani", locality: "", province: "", postalCode: "" }, payment: "efectivo", contactName: "Ana Pérez", idem: null }]);
  await go(page, "/carrito");
  await page.getByText("Sin stock por ahora.").waitFor();
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click({ force: true });
  expect(await audit(page)).toEqual([]);
});

test("axe: consulta preparada", async ({ page }) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [KEY, { items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "efectivo", contactName: "Ana Pérez", idem: null }]);
  await go(page, "/carrito");
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await page.waitForURL(/consulta\/TT-/);
  await page.locator("html[data-hydrated='true']").waitFor();
  expect(await audit(page)).toEqual([]);
});

test("axe: menú móvil y hoja de filtros abiertos", async ({ page, isMobile }) => {
  test.skip(!isMobile, "solo móvil");
  await go(page, "/sellados");
  await page.getByRole("button", { name: /Filtros y orden/ }).click();
  expect(await audit(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await page.locator("summary[aria-label=Menú]").click();
  expect(await audit(page)).toEqual([]);
});
