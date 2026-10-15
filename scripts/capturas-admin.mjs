// Capturas del panel /admin contra un servidor ya iniciado con ADMIN_EMAIL y correo local.
//   BASE=http://localhost:3400 MAIL_DIR=.local/data/capturas-admin-mail OWNER=dueno@example.test PREFIJO=admin-demo EDITAR=1 node scripts/capturas-admin.mjs
// EDITAR=1 carga algunos valores de PRUEBA (solo en la base de capturas, que es descartable) para mostrar estados e historial.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3400";
const MAIL_DIR = path.resolve(process.env.MAIL_DIR ?? ".local/data/capturas-admin-mail");
const OWNER = process.env.OWNER ?? "dueno@example.test";
const PREFIJO = process.env.PREFIJO ?? "admin";
const EDITAR = process.env.EDITAR === "1";
const PASSWORD = process.env.PASSWORD ?? "contraseña-de-capturas-123";
const out = "docs/capturas";
const problems = [];

async function verificationLink(to) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const mails = fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAIL_DIR, f), "utf8"))).filter((m) => m.to === to && m.kind === "verificacion") : [];
    if (mails.length) return mails.at(-1).link;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("No llegó el correo de confirmación");
}

const browser = await chromium.launch();
for (const [name, viewport, extra] of [["escritorio", { width: 1440, height: 900 }, {}], ["movil", { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: BASE, ...extra, extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  if (name === "escritorio") {
    // invitado: se lo manda a ingresar
    await page.goto("/admin");
    await page.screenshot({ path: `${out}/${PREFIJO}-invitado-redirige.png` });
    const r = await page.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de capturas", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
    if (!r.ok() && r.status() !== 422) problems.push(`registro: ${r.status()}`);
    if (r.ok()) await page.goto(await verificationLink(OWNER));
    else {
      await page.goto("/cuenta/ingresar");
      await page.getByLabel("Correo electrónico").fill(OWNER);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Ingresar" }).click();
    }
    await page.waitForURL(/cuenta/);
    await ctx.storageState({ path: ".local/data/capturas-admin-state.json" });
  } else {
    await ctx.close();
    var ctx2 = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: BASE, ...extra, storageState: ".local/data/capturas-admin-state.json" });
    var page2 = await ctx2.newPage();
    page2.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  }
  const p = name === "escritorio" ? page : page2;
  if (EDITAR && name === "escritorio") {
    const edits = [
      ["storm-sobre", { pricePesos: 10000, stock: 7, maxPerOrder: 3, visible: true }],
      ["ejemplo-sobre", { pricePesos: null, stock: 40, maxPerOrder: 10, visible: true }],
      ["storm-pack5", { pricePesos: 42000, stock: 0, maxPerOrder: 5, visible: true }],
      ["parcial-sobre", { pricePesos: 11000, stock: 12, maxPerOrder: 10, visible: false }],
    ];
    for (const [id, v] of edits) {
      const res = await p.request.patch(`${BASE}/api/admin/products/${id}`, { data: { ...v, expectedVersion: 0 }, headers: { Origin: BASE } });
      if (!res.ok()) problems.push(`edición ${id}: ${res.status()}`);
    }
  }
  await p.goto("/admin");
  await p.locator("html[data-hydrated='true']").waitFor();
  const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (over > 0) problems.push(`${name}: /admin desborde ${over}px`);
  await p.screenshot({ path: `${out}/${PREFIJO}-${name}-lista.png`, fullPage: name === "movil" ? false : true });
  if (name === "escritorio") {
    const fila = p.locator("[data-testid^=admin-fila-]").first();
    await fila.getByLabel("Precio (ARS)").fill("abc");
    await fila.getByRole("button", { name: "Guardar cambios" }).click();
    await p.locator("[data-testid=mensaje]").first().waitFor();
    await fila.screenshot({ path: `${out}/${PREFIJO}-validacion.png` });
    await p.goto("/admin/historial");
    await p.screenshot({ path: `${out}/${PREFIJO}-${name}-historial.png`, fullPage: true });
  } else {
    await p.goto("/admin/historial");
    const over2 = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over2 > 0) problems.push(`${name}: historial desborde ${over2}px`);
    await p.screenshot({ path: `${out}/${PREFIJO}-${name}-historial.png` });
  }
  await (name === "escritorio" ? ctx : ctx2).close();
}
await browser.close();
fs.rmSync(".local/data/capturas-admin-state.json", { force: true });
console.log(problems.length ? problems.join("\n") : "Capturas del panel OK: sin desborde ni errores de consola.");
process.exit(problems.length ? 1 : 0);
