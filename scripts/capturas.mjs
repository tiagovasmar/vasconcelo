// Capturas de página completa + comprobaciones básicas. Requiere el servidor en BASE (por defecto http://localhost:3000).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/capturas";
const sizes = [
  { name: "escritorio-1440", width: 1440, height: 900 },
  { name: "movil-390", width: 390, height: 844 },
  { name: "movil-320", width: 320, height: 700 },
];
const browser = await chromium.launch();
const problems = [];
for (const s of sizes) {
  const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/inicio-${s.name}.png`, fullPage: true });
  // Superposición texto/imagen en categorías y destacados
  const overlaps = await page.evaluate(() => {
    const bad = [];
    const hit = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
    document.querySelectorAll("#collections-title ~ div a, #collections-title + * ~ div a, section[aria-labelledby=collections-title] a.group").forEach((card) => {
      const [txt, art] = card.children;
      if (txt && art && hit(txt.getBoundingClientRect(), art.getBoundingClientRect())) bad.push("categoría " + card.querySelector("h3")?.textContent);
      card.querySelectorAll("h3,p").forEach((t) => { if (t.scrollWidth > t.clientWidth + 1) bad.push("texto cortado " + t.textContent.slice(0, 20)); });
    });
    document.querySelectorAll("section[aria-labelledby=feat-title] article h3").forEach((t) => {
      const r = t.getBoundingClientRect(); const c = t.closest("article").getBoundingClientRect();
      if (r.right > c.right + 1) bad.push("destacado desborda " + t.textContent);
    });
    return bad;
  });
  if (overlaps.length) problems.push(`${s.name}: ${overlaps.join(", ")}`);
  for (const [id, name] of [["collections-title", "categorias"], ["feat-title", "destacados"]]) {
    const sec = page.locator(`section[aria-labelledby=${id}]`);
    await sec.screenshot({ path: `${OUT}/${name}-${s.name}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (overflow > 0) problems.push(`${s.name}: desborde horizontal de ${overflow}px`);
  if (errors.length) problems.push(`${s.name}: errores de consola ${errors.join(" | ")}`);

  if (s.width < 1024) {
    await page.getByRole("button", { name: "Menú" }).or(page.locator("summary[aria-label=Menú]")).click();
    await page.screenshot({ path: `${OUT}/menu-${s.name}.png` });
    await page.keyboard.press("Escape");
    const open = await page.evaluate(() => document.querySelector("details")?.open);
    if (open) problems.push(`${s.name}: el menú no cierra con Escape`);
  } else {
    // Navegación por teclado: cada Tab debe mostrar foco visible
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (!first?.includes("Saltar")) problems.push("teclado: el primer Tab no es 'Saltar al contenido'");
    let seen = 0;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const ok = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return false;
        const cs = getComputedStyle(e);
        return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      });
      if (ok) seen++;
    }
    if (seen < 14) problems.push(`teclado: solo ${seen}/14 elementos con foco visible`);
  }
  await ctx.close();
}
// Enlaces internos
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE);
const hrefs = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
for (const h of hrefs) {
  const r = await page.request.get(BASE + h.split("#")[0]);
  if (!r.ok()) problems.push(`enlace roto ${h}: ${r.status()}`);
}
await browser.close();
console.log(problems.length ? "PROBLEMAS:\n" + problems.join("\n") : "OK: sin desbordes, sin errores de consola, teclado y enlaces correctos");
process.exit(problems.length ? 1 : 0);
