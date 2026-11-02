import fs from "node:fs";
import { chromium } from "@playwright/test";
import { realCatalog } from "../src/content/catalog";

/**
 * Capturas de la vista previa local de pedidos, encargos, comprobantes, avisos, costos y mayoristas (datos FICTICIOS de `npm run dev:pedidos`).
 *   Terminal 1: npm run dev:db      Terminal 2: npm run dev:admin && npm run dev:pedidos && npm run dev
 *   Terminal 3: npx tsx scripts/capturas-pedidos.ts            (BASE=http://localhost:3000 por defecto)
 * Cliente en escritorio y en celular (360, 390 y 430) y administración en escritorio. Falla si aparece desborde horizontal o un error de consola.
 */
for (const f of process.env.SKIP_ENV_FILES === "1" ? [] : [".env.local"]) if (fs.existsSync(f)) try { process.loadEnvFile(f); } catch { /* sin archivo */ }
const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas/pedidos";
fs.mkdirSync(OUT, { recursive: true });
const pw = fs.readFileSync(process.env.DEV_PEDIDOS_PASSWORD_FILE || ".local/dev-pedidos.txt", "utf8").trim();
const adminPw = fs.readFileSync(process.env.DEV_ADMIN_PASSWORD_FILE || ".local/dev-admin.txt", "utf8").trim();
const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const problems: string[] = [];

async function session(browser: Awaited<ReturnType<typeof chromium.launch>>, email: string, password: string, width: number, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/.test(m.text())) problems.push(`consola (${page.url()}): ${m.text()}`); });
  await page.goto("/cuenta/ingresar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/ingresar"));
  return { ctx, page };
}
async function shot(page: import("@playwright/test").Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 0) problems.push(`desborde horizontal de ${over}px en ${name}`);
  const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc).map((i) => i.currentSrc));
  if (broken.length) problems.push(`imagen rota en ${name}: ${broken[0]}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("captura", name);
}

async function main() {
  const browser = await chromium.launch();
  const producto = realCatalog.products.filter((p) => p.active && !p.retired && !p.addonOnly)[0];
  // ANCHOS=escritorio,movil-390 limita los anchos (por defecto todos); ADMIN=0 omite las capturas del panel.
  const anchos = (process.env.ANCHOS ?? "escritorio,movil-360,movil-390,movil-430").split(",");
  for (const [label, width] of ([["escritorio", 1440], ["movil-360", 360], ["movil-390", 390], ["movil-430", 430]] as const).filter(([l]) => anchos.includes(l))) {
    const { ctx, page } = await session(browser, "ana.prueba@example.com", pw, width);
    await page.goto("/cuenta/consultas");
    const refs = [...new Set((await page.content()).match(/TT-[A-Z0-9]{8}/g) ?? [])];
    if (label === "escritorio") await shot(page, `cliente-mis-consultas-${label}`);
    for (const ref of refs.slice(0, 2)) {
      await page.goto(`/cuenta/consultas/${ref}`);
      await shot(page, `cliente-seguimiento-${ref.slice(3)}-${label}`);
    }
    await page.goto(`/productos/${producto.slug}`);
    await shot(page, `cliente-ficha-agotado-avisame-${label}`);
    await page.goto("/cuenta/avisos");
    if (label === "escritorio") await shot(page, `cliente-mis-avisos-${label}`);
    await ctx.close();
    const m = await session(browser, "marta.prueba@example.com", pw, width);
    await m.page.goto("/mayoristas/catalogo");
    const q = m.page.locator("input[id^='qty-']").first();
    await q.waitFor(); // Una pantalla sin acceso NO es una verificación del catálogo.
    await q.fill("50");
    await shot(m.page, `mayorista-catalogo-${label}`);
    if (label === "escritorio") { await m.page.goto("/mayoristas"); await shot(m.page, `mayorista-informacion-${label}`); }
    await m.ctx.close();
  }
  if (process.env.ADMIN === "0") { await browser.close(); return; }
  const { ctx, page } = await session(browser, adminEmail, adminPw, 1440);
  await page.goto("/admin/pedidos");
  const refs = [...new Set((await page.content()).match(/TT-[A-Z0-9]{8}/g) ?? [])];
  await shot(page, "admin-pedidos");
  if (refs[0]) { await page.goto(`/admin/pedidos/${refs[0]}`); await shot(page, "admin-pedido-detalle"); }
  if (refs[1]) { await page.goto(`/admin/pedidos/${refs[1]}`); await shot(page, "admin-pedido-detalle-con-reintegro"); }
  for (const [url, name] of [["/admin/envios", "admin-envios"], ["/admin/costos", "admin-costos-y-ganancia"], ["/admin/mayoristas", "admin-mayoristas"], ["/admin/reposicion", "admin-reposicion"], ["/admin/avisos", "admin-avisos"]] as const) {
    await page.goto(url);
    await shot(page, name);
  }
  // Panel en los tres anchos de celular.
  for (const width of [360, 390, 430]) {
    const mob = await session(browser, adminEmail, adminPw, width);
    for (const url of ["/admin/pedidos", ...(refs[0] ? [`/admin/pedidos/${refs[0]}`] : []), "/admin/envios", "/admin/costos", "/admin/mayoristas", "/admin/reposicion", "/admin/avisos"]) {
      await mob.page.goto(url);
      await shot(mob.page, `${url.replace(/\//g, "-").slice(1)}-movil-${width}`);
    }
    await mob.ctx.close();
  }
  await ctx.close();
  await browser.close();
  fs.writeFileSync(`${OUT}/INFORME.txt`, problems.length ? problems.join("\n") : "Sin desborde horizontal, imágenes rotas ni errores de consola en las capturas.\n");
  console.log(problems.length ? `PROBLEMAS:\n${problems.join("\n")}` : "Capturas sin problemas.");
  if (problems.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
