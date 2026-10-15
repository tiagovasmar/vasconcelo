import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL. Carrusel de banners por colección (inicio) y banner en el detalle de cada expansión.
const ORDEN = ["storm-emeralda", "30th-celebration", "abyss-eye", "mega-dream-ex", "inferno-x", "heat-wave-arena", "white-flare", "black-bolt"];
const TITULOS: Record<string, string> = { "storm-emeralda": "Storm", "30th-celebration": "30th", "abyss-eye": "Abyss", "mega-dream-ex": "MEGA", "inferno-x": "Inferno", "heat-wave-arena": "Heat", "white-flare": "White", "black-bolt": "Black" };
const activo = (page: Page) => page.locator("[data-testid^=diapositiva-][data-active=true]").getAttribute("data-testid");
const imgs = (page: Page, id: string) => page.getByTestId(`diapositiva-${id}`).locator("img");

test("carrusel con un banner por colección, empieza con Storm Emeralda, un solo h1 y (con movimiento reducido) sin rotación automática", async ({ page }) => {
  await go(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const ids = await page.locator("[data-testid^=diapositiva-]").evaluateAll((l) => l.map((x) => x.getAttribute("data-testid")!.replace("diapositiva-", "")));
  expect(ids).toEqual(ORDEN);
  expect(await activo(page)).toBe("diapositiva-storm-emeralda");
  const region = page.getByRole("region", { name: "Colecciones destacadas" });
  await expect(region).toHaveAttribute("aria-roledescription", "carrusel");
  // primer banner: texto y botones reales, accesos a productos y galería de cartas, arte registrado
  const s = page.getByTestId("banner-storm-emeralda");
  await expect(s.getByRole("heading", { level: 2 })).toHaveText(/Storm\s*Emeralda/);
  await expect(s).toContainText("Mega Rayquaza ex");
  await expect(s.getByRole("link", { name: "Ver productos" })).toHaveAttribute("href", "/sellados?expansion=storm-emeralda");
  await expect(s.getByRole("link", { name: "Galería de cartas" })).toHaveAttribute("href", "/expansiones/storm-emeralda#exp-cartas");
  await expect(s).not.toContainText(/cuotas|descuento/i);
  const arte = s.getByTestId("banner-arte").getByRole("img", { name: /Mega Rayquaza ex/ });
  await expect(arte).toBeVisible();
  expect(decodeURIComponent((await arte.getAttribute("src"))!)).toContain("/images/inicio/hero-storm-emeralda");
  // los demás banners no se ven (inert) y tienen sus accesos
  for (const id of ORDEN.slice(1)) {
    const d = page.getByTestId(`diapositiva-${id}`);
    await expect(d).toHaveAttribute("inert", "");
    await expect(d.getByRole("link", { name: "Ver productos" })).toHaveAttribute("href", `/sellados?expansion=${id}`);
    await expect(d.getByRole("link", { name: "Galería de cartas" })).toHaveAttribute("href", `/expansiones/${id}#exp-cartas`);
  }
  // con movimiento reducido (config de las pruebas) el avance automático arranca detenido; el botón permite reanudarlo
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await expect(page.getByTestId("carrusel-pausa")).toHaveAccessibleName(/Reanudar/);
  await page.waitForTimeout(6500);
  expect(await activo(page)).toBe("diapositiva-storm-emeralda");
});

test("solo el banner visible carga sus imágenes; las de los demás se difieren hasta que se necesitan", async ({ page }) => {
  await go(page, "/");
  expect(await imgs(page, "storm-emeralda").count()).toBe(3);
  for (const id of ORDEN.slice(1)) expect(await imgs(page, id).count(), id).toBe(0);
  const pedidas = () => page.evaluate(() => performance.getEntriesByType("resource").map((r) => decodeURIComponent(r.name)).filter((u) => u.includes("/images/inicio/hero-")));
  expect((await pedidas()).every((u) => u.includes("hero-storm-emeralda"))).toBe(true);
  await page.getByTestId("carrusel-siguiente").click();
  expect(await activo(page)).toBe("diapositiva-30th-celebration");
  await expect.poll(() => imgs(page, "30th-celebration").count()).toBe(3);
  await expect.poll(() => imgs(page, "abyss-eye").count()).toBe(3); // el contiguo queda listo
  expect(await imgs(page, "black-bolt").count()).toBe(0);
});

test("flechas, indicadores y teclado; los banners ocultos quedan fuera de la tabulación", async ({ page }) => {
  await go(page, "/");
  const prev = page.getByTestId("carrusel-anterior");
  const next = page.getByTestId("carrusel-siguiente");
  await expect(prev).toHaveAttribute("aria-disabled", "true");
  await next.click();
  await expect.poll(() => activo(page)).toBe("diapositiva-30th-celebration");
  await expect(page.getByTestId("carrusel-anuncio")).toHaveText(/Banner 2 de 8: 30th CELEBRATION/);
  await expect(page.getByTestId("indicador-30th-celebration")).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("indicador-storm-emeralda")).not.toHaveAttribute("aria-current", "true");
  await prev.click();
  await expect.poll(() => activo(page)).toBe("diapositiva-storm-emeralda");
  await page.getByTestId("indicador-black-bolt").click();
  await expect.poll(() => activo(page)).toBe("diapositiva-black-bolt");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("button", { name: "Ir al banner 8: Black Bolt" })).toHaveAttribute("aria-current", "true");
  // teclado, con el foco dentro del carrusel
  await page.getByTestId("banner-black-bolt").getByRole("link", { name: "Ver productos" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => activo(page)).toBe("diapositiva-white-flare");
  await page.keyboard.press("Home");
  await expect.poll(() => activo(page)).toBe("diapositiva-storm-emeralda");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => activo(page)).toBe("diapositiva-30th-celebration");
  await page.keyboard.press("End");
  await expect.poll(() => activo(page)).toBe("diapositiva-black-bolt");
  await page.getByTestId("indicador-heat-wave-arena").click();
  await expect.poll(() => activo(page)).toBe("diapositiva-heat-wave-arena");
  const fuera = await page.locator("[data-testid^=diapositiva-]:not([data-active=true]) a, [data-testid^=diapositiva-]:not([data-active=true]) button").evaluateAll((l) => l.every((x) => !!x.closest("[inert]")));
  expect(fuera).toBe(true);
});

test("el deslizado (scroll táctil) cambia de banner y el indicador lo sigue, sin desborde horizontal", async ({ page }) => {
  await go(page, "/");
  await page.getByTestId("carrusel-pista").evaluate((el) => el.scrollTo({ left: el.clientWidth * 2, behavior: "instant" }));
  await expect.poll(() => activo(page)).toBe("diapositiva-abyss-eye");
  await expect(page.getByTestId("indicador-abyss-eye")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => imgs(page, "abyss-eye").count()).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test("cada banner usa su propio arte, sus fotos de la colección y su paleta, sin deformar las fotos", async ({ page }) => {
  await go(page, "/");
  await page.getByTestId("carrusel").scrollIntoViewIfNeeded();
  const fondos = new Set<string>();
  for (const id of ORDEN) {
    await page.getByTestId(`indicador-${id}`).click();
    await expect.poll(() => activo(page)).toBe(`diapositiva-${id}`);
    const d = page.getByTestId(`diapositiva-${id}`);
    await expect.poll(() => imgs(page, id).count()).toBe(3);
    const arte = d.getByTestId("banner-arte").locator("img").first();
    await expect(arte).toHaveJSProperty("complete", true);
    // espera a que carguen también el sobre y la caja (condición observable, no un tiempo)
    await expect.poll(() => d.getByTestId("banner-arte").locator("img").evaluateAll((l) => l.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
    expect(decodeURIComponent((await arte.getAttribute("src"))!), id).toContain(`hero-${id}`);
    const fotos = await d.getByTestId("banner-arte").locator("img").evaluateAll((l) => l.map((i) => decodeURIComponent((i as HTMLImageElement).currentSrc)));
    expect(fotos.filter((f) => f.includes("/images/products/")).every((f) => f.includes(`/${id}/`)), id).toBe(true);
    const medidas = await d.getByTestId("banner-arte").locator("img").evaluateAll((l) => l.map((i) => { const im = i as HTMLImageElement; return { cargada: im.naturalWidth > 0, visible: im.offsetWidth > 0, razonFoto: im.naturalWidth / im.naturalHeight, razonCaja: im.offsetWidth / im.offsetHeight }; }));
    expect(medidas.every((m) => m.cargada && m.visible)).toBe(true);
    for (const m of medidas.slice(1)) expect(Math.abs(m.razonFoto - m.razonCaja) / m.razonFoto, id).toBeLessThan(0.03);
    fondos.add(await d.getByTestId(`banner-${id}`).evaluate((s) => (s as HTMLElement).style.getPropertyValue("--b2").trim()));
    await expect(d.getByRole("heading", { level: 2 })).toContainText(TITULOS[id]);
  }
  expect(fondos.size).toBe(ORDEN.length);
});

test("detalle de expansión: banner de su colección con h1; los botones llevan a sus secciones", async ({ page }) => {
  await go(page, "/expansiones/heat-wave-arena");
  const b = page.getByTestId("banner-heat-wave-arena");
  await expect(b.getByRole("heading", { level: 1 })).toHaveText(/Heat\s*Wave\s*Arena/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(b.getByRole("img", { name: /Ho-Oh ex/ })).toBeVisible();
  await expect(b.getByRole("link", { name: "Ver productos" })).toHaveAttribute("href", "#exp-prods");
  await expect(b.getByRole("link", { name: "Galería de cartas" })).toHaveAttribute("href", "#exp-cartas");
  await expect(b).toContainText("92 cartas");
  await b.getByRole("link", { name: "Galería de cartas" }).click();
  await expect(page).toHaveURL(/#exp-cartas$/);
  for (const slug of ["black-bolt", "white-flare", "inferno-x", "mega-dream-ex", "30th-celebration", "storm-emeralda", "abyss-eye"]) {
    await go(page, `/expansiones/${slug}`);
    await expect(page.getByTestId(`banner-${slug}`).getByRole("heading", { level: 1 })).toBeVisible();
  }
});
