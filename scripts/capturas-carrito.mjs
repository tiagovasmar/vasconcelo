// Capturas del flujo de carrito (escritorio y móvil) contra un servidor en BASE. Crea una consulta de prueba en la base local.
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas";
const KEY = "tienda-carrito-v1";
const sizes = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "movil", width: 390, height: 844 },
  { name: "movil-320", width: 320, height: 700 },
];
const items = [
  { productId: "storm-sobre", quantity: 2, priceMinor: 950000 },
  { productId: "storm-pack5", quantity: 1, priceMinor: 4200000 },
];
const browser = await chromium.launch();
const problems = [];
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const seed = async (value) => {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, value]);
  };
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) problems.push(`${name} ${s.name}: desborde horizontal ${over}px`);
  };

  await seed({ items: [], delivery: {}, payment: "coordinar", contactName: "", idem: null });
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle" });
  await shot("carrito-vacio");

  await seed({ items, delivery: { method: "andreani", locality: "Ramos Mejía", province: "Buenos Aires", postalCode: "1704" }, payment: "coordinar", contactName: "Inés", idem: null });
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle" });
  await page.getByTestId("resumen-subtotal").waitFor();
  await shot("carrito");

  await seed({ items: [{ productId: "storm-caja", quantity: 1, priceMinor: 17000000 }, { productId: "parcial-bundle", quantity: 1, priceMinor: 6800000 }, ...items], delivery: {}, payment: "coordinar", contactName: "", idem: null });
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle" });
  await page.getByText("Sin stock por ahora.").waitFor();
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click({ force: true }).catch(() => {});
  await shot("carrito-avisos");

  await seed({ items, delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", contactName: "", idem: null });
  await page.goto(`${BASE}/carrito`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await page.waitForURL(/consulta\/TT-/);
  await page.waitForLoadState("networkidle");
  await shot("consulta");
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMAS:\n" + problems.join("\n") : "OK: capturas del carrito sin desborde");
process.exit(problems.length ? 1 : 0);
