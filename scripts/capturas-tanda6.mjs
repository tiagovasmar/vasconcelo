// Capturas de la tanda 6 (panel completo, precios USD/ARS y portadas del aniversario). Usa DOS servidores de producto ya iniciados con
// ADMIN_EMAIL, correo local y FX_AUTO_REFRESH=0:
//   A (catálogo de PRUEBA, CATALOG_FIXTURE=demo): panel, cotización y precios públicos. Se cargan valores y una cotización de PRUEBA
//      (1.234 pesos por dólar, sintética) solo en su base descartable.
//   B (catálogo REAL, sin cargar nada): portadas del aniversario y la ficha de Bulbasaur (borrador) vista como administrador.
//   BASE_A=http://localhost:3400 MAIL_A=.local/data/cap6-a-mail BASE_B=http://localhost:3401 MAIL_B=.local/data/cap6-b-mail node scripts/capturas-tanda6.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OWNER = process.env.OWNER ?? "dueno@example.test";
const PASSWORD = "contraseña-de-capturas-123";
const out = "docs/capturas/tanda6";
fs.mkdirSync(out, { recursive: true });
const problems = [];

async function link(mailDir, to) {
  const dir = path.resolve(mailDir);
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const m = fs.existsSync(dir) ? fs.readdirSync(dir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter((x) => x.to === to && x.kind === "verificacion") : [];
    if (m.length) return m.at(-1).link;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("No llegó el correo de confirmación");
}

async function login(browser, base, mailDir, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", baseURL: base, ...extra, extraHTTPHeaders: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && problems.push(`${base}: consola: ${m.text()}`));
  const r = await page.request.post(`${base}/api/auth/sign-up/email`, { data: { name: "Dueño de capturas", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: base } });
  if (r.ok()) await page.goto(await link(mailDir, OWNER));
  else {
    await page.goto("/cuenta/ingresar");
    await page.getByLabel("Correo electrónico").fill(OWNER);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
  }
  await page.waitForURL(/cuenta/);
  return { ctx, page };
}

const shot = async (page, name, opts = {}) => {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true, ...opts });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) problems.push(`${name}: desborde horizontal de ${over}px`);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map((i) => i.src));
  if (broken.length) problems.push(`${name}: imágenes rotas ${broken.join(", ")}`);
};

const browser = await chromium.launch();
const BASE_A = process.env.BASE_A ?? "http://localhost:3400";
const BASE_B = process.env.BASE_B ?? "http://localhost:3401";

// ---------------------------------------------------------------- A: catálogo de prueba, valores de PRUEBA
{
  const { ctx, page } = await login(browser, BASE_A, process.env.MAIL_A ?? ".local/data/cap6-a-mail", { width: 1440, height: 900 });
  const api = (m, p, data) => page.request.fetch(`${BASE_A}${p}`, { method: m, data, headers: { Origin: BASE_A } });
  await page.goto("/admin/cotizacion");
  await shot(page, "cotizacion-0-sin-cotizacion");
  // Valores de PRUEBA (sintéticos): cotización 1.234 y algunos precios en USD.
  await api("POST", "/api/admin/fx", { action: "manual", rate: "1234", note: "valor de PRUEBA para las capturas" });
  const edits = [["storm-sobre", { priceUsdMinor: 1000, stock: 7, maxPerOrder: 3 }], ["storm-caja", { priceUsdMinor: 15000, stock: 4 }], ["storm-pack5", { priceUsdMinor: 4250, stock: 0 }], ["parcial-sobre", { priceUsdMinor: 1235, stock: 12 }]];
  for (const [id, v] of edits) {
    const res = await api("PATCH", `/api/admin/products/${id}`, { expectedVersion: 0, ...v });
    if (!res.ok()) problems.push(`PATCH ${id}: ${res.status()}`);
  }
  // una foto subida de PRUEBA como portada de storm-sobre
  const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: { r: 18, g: 110, b: 82 } } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><text x="450" y="620" font-size="72" text-anchor="middle" fill="#fff" font-family="Arial">FOTO DE PRUEBA</text></svg>'), top: 0, left: 0 }]).png().toBuffer();
  const up = await page.request.post(`${BASE_A}/api/admin/media`, { multipart: { file: { name: "prueba.png", mimeType: "image/png", buffer: png } }, headers: { Origin: BASE_A } });
  const img = (await up.json()).image;
  const own = ["storm-sobre"];
  void own;

  for (const [name, p] of [["admin-lista", "/admin"], ["admin-lista-filtrada", "/admin?q=storm"], ["admin-editor-ficha", "/admin/productos/storm-sobre"], ["admin-cotizacion", "/admin/cotizacion"]]) {
    await page.goto(p);
    if (name === "admin-editor-ficha" && img) {
      // agrega la foto subida como portada (sin guardar la galería todavía: se ve el aviso de cambios sin guardar)
      await page.locator("input[type=file]").setInputFiles({ name: "prueba.png", mimeType: "image/png", buffer: png });
      await page.getByText("Foto subida").waitFor();
      const last = page.locator("[data-testid^=foto-]").last();
      await last.getByRole("button", { name: "Hacer portada" }).click();
    }
    await shot(page, p.startsWith("/admin?q") ? name : name);
  }
  // vista previa de fuerza: cotización con otra cotización probada
  await page.goto("/admin/cotizacion");
  await page.getByTestId("fx-candidata").fill("1300");
  await shot(page, "admin-cotizacion-vista-previa");

  // público: pesos principal y USD debajo
  const pub = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", baseURL: BASE_A });
  const v = await pub.newPage();
  for (const [name, p] of [["publico-ficha-precio", "/productos/storm-emeralda-sobre"], ["publico-catalogo-precios", "/sellados?q=storm"], ["publico-inicio", "/"]]) {
    await v.goto(p);
    if (name === "publico-ficha-precio") await v.getByTestId("fx-note").first().locator("summary").click();
    await shot(v, name);
  }
  await pub.close();
  // móvil
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", baseURL: BASE_A, storageState: await ctx.storageState() });
  const m = await mob.newPage();
  for (const [name, p] of [["movil-admin-lista", "/admin?q=storm"], ["movil-admin-editor", "/admin/productos/storm-sobre"], ["movil-admin-cotizacion", "/admin/cotizacion"], ["movil-publico-ficha", "/productos/storm-emeralda-sobre"]]) {
    await m.goto(p);
    await shot(m, name);
  }
  await mob.close();
  await ctx.close();
}

// ---------------------------------------------------------------- B: catálogo real (portadas del aniversario y Bulbasaur en borrador)
{
  const { ctx, page } = await login(browser, BASE_B, process.env.MAIL_B ?? ".local/data/cap6-b-mail", { width: 1440, height: 900 });
  for (const [name, p] of [["portada-vol2-totodile", "/productos/zh-30-zhounian-ilustraciones-vol2"], ["portada-vol3-torchic", "/productos/zh-30-zhounian-ilustraciones-vol3"], ["coleccion-30th-celebration-china", "/expansiones/zh-30-zhounian"], ["admin-bulbasaur-lista", "/admin?q=bulbasaur"], ["admin-bulbasaur-editor", "/admin/productos/zh-30-zhounian-carta-p-bulbasaur"], ["bulbasaur-vista-previa-admin", "/productos/zh-30-zhounian-carta-p-bulbasaur?preview=1"]]) {
    await page.goto(p);
    await shot(page, name);
  }
  // el público NO ve la ficha en borrador
  const pub = await browser.newContext({ baseURL: BASE_B });
  const r = await pub.request.get(`${BASE_B}/productos/zh-30-zhounian-carta-p-bulbasaur?preview=1`);
  if (r.status() !== 404) problems.push(`Bulbasaur visible para el público: ${r.status()}`);
  await pub.close();
  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce", baseURL: BASE_B });
  const m = await mob.newPage();
  for (const [name, p] of [["movil-portada-vol2", "/productos/zh-30-zhounian-ilustraciones-vol2"], ["movil-portada-vol3", "/productos/zh-30-zhounian-ilustraciones-vol3"]]) {
    await m.goto(p);
    await shot(m, name);
  }
  await mob.close();
  await ctx.close();
}

await browser.close();
console.log(problems.length ? `PROBLEMAS:\n${problems.join("\n")}` : "Capturas sin desborde horizontal, imágenes rotas ni errores de consola.");
process.exitCode = problems.length ? 1 : 0;
