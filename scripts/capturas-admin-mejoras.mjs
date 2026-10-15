// Capturas del panel con las mejoras (filtros, stock bajo, edición múltiple, subida de varias fotos) y de las fichas con fotos nuevas.
// Usa un servidor de producción PROPIO ya iniciado con una COPIA de la base (nunca la real), ADMIN_EMAIL y correo local:
//   NEXT_DIST_DIR=.next-perf DATABASE_PATH=.local/data/cap-admin.db ADMIN_EMAIL=dueno@example.test MAIL_DIR=.local/data/cap-admin-mail MAIL_TRANSPORT=local \
//   BETTER_AUTH_SECRET=<largo> BETTER_AUTH_URL=http://localhost:3420 FX_AUTO_REFRESH=0 node node_modules/next/dist/bin/next start -p 3420
//   BASE=http://localhost:3420 MAIL_DIR=.local/data/cap-admin-mail node scripts/capturas-admin-mejoras.mjs
// Las cantidades de stock de la copia (2, 1 y 5) son de PRUEBA y solo existen en esa base descartable.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://localhost:3420";
const MAIL = path.resolve(process.env.MAIL_DIR ?? ".local/data/cap-admin-mail");
const OWNER = "dueno@example.test";
const PASSWORD = "contraseña-de-capturas-123";
const out = "docs/capturas/admin-mejoras";
fs.mkdirSync(out, { recursive: true });
const problems = [];

async function link(to) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const m = fs.existsSync(MAIL) ? fs.readdirSync(MAIL).sort().map((f) => JSON.parse(fs.readFileSync(path.join(MAIL, f), "utf8"))).filter((x) => x.to === to && x.kind === "verificacion") : [];
    if (m.length) return m.at(-1).link;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("No llegó el correo de confirmación");
}
const png = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();

const browser = await chromium.launch();
// Una sola alta + confirmación por el enlace del correo local; la sesión se reutiliza en los dos tamaños de pantalla.
const setup = await browser.newContext({ baseURL: BASE });
const sp = await setup.newPage();
const reg = await sp.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de capturas", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
if (!reg.ok()) throw new Error("No se pudo crear la cuenta de capturas (¿la base ya la tiene? usar una copia nueva)");
await sp.goto(await link(OWNER));
await sp.waitForLoadState("networkidle");
const storageState = await setup.storageState();
await setup.close();
for (const [name, viewport] of [["escritorio", { width: 1360, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: BASE, storageState });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${name}: consola: ${m.text()}`));
  const shot = async (url, file, opts = {}) => {
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector("html[data-hydrated=true]");
    if (opts.before) await opts.before();
    await page.screenshot({ path: `${out}/${name}-${file}.png`, fullPage: opts.full ?? false });
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) problems.push(`${name} ${file}: desborde horizontal`);
  };
  await shot("/admin?formato=box&idioma=ja", "lista-filtros-formato-idioma");
  await shot("/admin?estado=low", "lista-stock-bajo");
  await shot("/admin?coleccion=ninja-spinner", "lista-edicion-multiple", {
    full: true,
    before: async () => {
      await page.getByTestId("seleccionar-todo").check();
      await page.getByTestId("masivo-stock-modo").selectOption("add");
      await page.getByTestId("masivo-stock-valor").fill("5");
      await page.getByTestId("masivo-stock-aplicar").click();
      await page.getByTestId("masivo-precio-modo").selectOption("pct");
      await page.getByTestId("masivo-precio-valor").fill("10");
      await page.getByTestId("masivo-precio-aplicar").click();
    },
  });
  await shot("/admin/productos/pokemon-card-151-caja", "editor-fotos-varias", {
    full: true,
    before: async () => {
      await page.getByTestId("subir-foto").setInputFiles([
        { name: "caja-frente.png", mimeType: "image/png", buffer: await png(900, 700, { r: 20, g: 130, b: 90 }) },
        { name: "caja-lateral.png", mimeType: "image/png", buffer: await png(800, 800, { r: 200, g: 160, b: 60 }) },
        { name: "rota.png", mimeType: "image/png", buffer: Buffer.from("no soy una imagen") },
      ]);
      await page.getByTestId("mensaje-fotos").filter({ hasText: "fotos subidas" }).waitFor();
    },
  });
  for (const s of ["zh-taijing-shengju-caja", "zh-shengxiang-xingyin-caja", "zh-baoshibao-vol6-caja"]) await shot(`/productos/${s}`, `ficha-${s}`);
  await ctx.close();
}
await browser.close();
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log("Capturas en", out);
