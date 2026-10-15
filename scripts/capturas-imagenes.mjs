// Capturas del inicio y el catálogo (escritorio y móvil) para revisar fondos de las fotos y banderas de idioma.
// Uso: servidor en :3000, `node scripts/capturas-imagenes.mjs <prefijo>` (por ejemplo «despues»).
import { chromium } from "@playwright/test";
const pref = process.argv[2] ?? "captura";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "docs/capturas/imagenes-idiomas";
const browser = await chromium.launch();
for (const [nombre, vp] of [["escritorio", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport: vp, reducedMotion: "reduce" })).newPage();
  for (const [ruta, id] of [["/", "inicio"], ["/sellados", "sellados"], ["/productos/black-bolt-caja", "ficha-bb"], ["/productos/storm-caja", "ficha-storm"]]) {
    await page.goto(base + ruta, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${pref}-${id}-${nombre}.png`, fullPage: true });
  }
  // los ocho banners del carrusel
  await page.goto(base + "/", { waitUntil: "networkidle" });
  const n = await page.locator('[data-testid^="diapositiva-"]').count();
  for (let i = 0; i < n; i++) {
    await page.getByTestId("carrusel").focus();
    if (i) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    await page.getByTestId("carrusel").screenshot({ path: `${out}/${pref}-banner-${i + 1}-${nombre}.png` });
  }
  await page.context().close();
}
await browser.close();
