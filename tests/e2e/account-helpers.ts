import fs from "node:fs";
import path from "node:path";
import { expect, test as base, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor "demo" (sin WhatsApp). El correo sale a una carpeta local aislada: los enlaces se leen de esos archivos.
export const stamp = process.env.E2E_STAMP!;
export const MAIL_DIR = path.resolve(`.local/data/e2e-${stamp}-demo-mail`);
/** Base PostgreSQL real y descartable del servidor «demo» (la levanta scripts/pg-test-server.ts). */
export const DB_URL = `postgres://postgres:postgres@127.0.0.1:${process.env.PG_TEST_PORT || 54398}/e2e_demo`;
export const ORIGIN = "http://localhost:3100";
export const CART_KEY = "tienda-carrito-v1";
export const PASSWORD = "contraseña-segura-123";

export const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
// Cada prueba usa su propia IP de origen: los límites de uso son reales y no deben mezclarse entre pruebas.
export const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
// Better Auth normaliza los correos a minúsculas.
export const newEmail = (tag = "u") => `${tag}-${uid()}@example.com`.toLowerCase();

export type Mail = { to: string; kind: string; link: string; createdAt: string };
export async function waitForMail(to: string, kind: "verificacion" | "recuperacion", afterCount = 0): Promise<Mail> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(MAIL_DIR)
      ? fs.readdirSync(MAIL_DIR).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")) as Mail).filter((m) => m.to === to && m.kind === kind)
      : [];
    if (found.length > afterCount) return found[found.length - 1];
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo local (${kind}) para ${to}`);
}
export const countMails = (to: string, kind: string) =>
  fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8")) as Mail).filter((m) => m.to === to && m.kind === kind).length : 0;

/** Alta rápida por API (misma ruta que usa la interfaz) + confirmación con el enlace del correo local. Deja la sesión iniciada en `page`. */
export async function signUp(page: Page, name: string, email: string, password = PASSWORD) {
  const res = await page.request.post("/api/auth/sign-up/email", { data: { name, email, password, callbackURL: "/cuenta/verificado" }, headers: { Origin: ORIGIN } });
  expect(res.ok()).toBe(true);
  const mail = await waitForMail(email, "verificacion");
  await go(page, mail.link);
  await expect(page.getByTestId("verificacion-ok")).toBeVisible();
}
export const logoutApi = (page: Page) => page.request.post("/api/auth/sign-out", { data: {}, headers: { Origin: ORIGIN } });
export async function loginUI(page: Page, email: string, password = PASSWORD, next?: string) {
  await go(page, `/cuenta/ingresar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
export const seedCart = async (page: Page, items = [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], extra: Record<string, unknown> = {}) => {
  await go(page, "/");
  await page.evaluate(([k, v]) => localStorage.setItem(k as string, JSON.stringify(v)), [CART_KEY, { items, delivery: {}, payment: "efectivo", contactName: "", idem: null, ...extra }]);
};
export async function prepareInquiry(page: Page) {
  await go(page, "/carrito");
  // Espera a que lleguen los precios y se acomode la página (las líneas crecen al validar): así el toque no cae en un diseño que todavía se mueve.
  await expect(page.getByTestId("vista-previa")).toContainText("Unitario");
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
  return page.url().match(/TT-[A-Z2-9]{8}/)![0];
}
