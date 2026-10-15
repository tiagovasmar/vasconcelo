// Capturas de las pantallas de cuenta. Usa un servidor propio con base y correo temporales (ver BASE y MAIL_DIR).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3200";
const MAIL_DIR = path.resolve(process.env.MAIL_DIR ?? ".local/data/capturas-mail");
const OUT = "docs/capturas";
const sizes = [
  { name: "escritorio", width: 1440, height: 900 },
  { name: "movil", width: 390, height: 844 },
  { name: "movil-320", width: 320, height: 700 },
];
const lastLink = async (to, kind) => {
  for (let i = 0; i < 100; i++) {
    const files = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).sort() : [];
    const mails = files.map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8"))).filter((m) => m.to === to && m.kind === kind);
    if (mails.length) return mails.at(-1).link;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("sin correo");
};
const browser = await chromium.launch();
const problems = [];
let n = 0;
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "reduce", extraHTTPHeaders: { "x-forwarded-for": `10.9.${++n}.1` } });
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.screenshot({ path: `${OUT}/${name}-${s.name}.png`, fullPage: true });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) problems.push(`${name} ${s.name}: desborde ${over}px`);
  };
  for (const [name, route] of [["cuenta-invitado", "/cuenta"], ["cuenta-ingresar", "/cuenta/ingresar"], ["cuenta-registro", "/cuenta/registro"], ["cuenta-recuperar", "/cuenta/recuperar"]]) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await shot(name);
  }
  // consulta de invitado + alta + confirmación
  const email = `captura-${s.name}-${Date.now()}@example.com`;
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("tienda-carrito-v1", JSON.stringify({ items: [{ productId: "storm-sobre", quantity: 2, priceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", contactName: "", idem: null })));
  await page.goto(BASE + "/carrito", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await page.waitForURL(/consulta\/TT-/);
  await page.request.post(BASE + "/api/auth/sign-up/email", { data: { name: "Ana Pérez", email, password: "contraseña-segura-123", callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
  await page.goto(await lastLink(email, "verificacion"), { waitUntil: "networkidle" });
  await shot("cuenta-verificado");
  await page.request.post(BASE + "/api/favorites", { data: { productId: "storm-caja" }, headers: { Origin: BASE } });
  await page.request.post(BASE + "/api/favorites", { data: { productId: "ejemplo-sobre" }, headers: { Origin: BASE } });
  for (const [name, route] of [["cuenta-resumen", "/cuenta"], ["cuenta-consultas-reclamar", "/cuenta/consultas"]]) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await shot(name);
  }
  await page.getByRole("button", { name: "Agregar a mi cuenta" }).click();
  await page.getByText("Agregamos 1 consulta").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await shot("cuenta-consultas");
  for (const [name, route] of [["cuenta-favoritos", "/cuenta/favoritos"], ["cuenta-perfil", "/cuenta/perfil"]]) {
    await page.goto(BASE + route, { waitUntil: "networkidle" });
    await shot(name);
  }
  await ctx.close();
}
await browser.close();
console.log(problems.length ? "PROBLEMAS:\n" + problems.join("\n") : "OK: capturas de cuenta sin desborde");
process.exit(problems.length ? 1 : 0);
