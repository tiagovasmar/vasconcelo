import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor con el catálogo REAL. Tanda 3: banner móvil más corto, fichas simplificadas, «qué garantiza» por caja y cajas sin fondo blanco.
const sinDesborde = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
const IDS = ["storm-emeralda", "30th-celebration", "abyss-eye", "mega-dream-ex", "inferno-x", "heat-wave-arena", "white-flare", "black-bolt"];
// Alturas medidas ANTES de la tanda (390 → 688 px, 320 → 661 px, 430 → 650 px) y tope nuevo (reducción de 15–25 %, sin recortar textos).
const TOPES: Array<[number, number, number]> = [[320, 720, 540], [390, 844, 560], [430, 844, 580]];

for (const [ancho, alto, tope] of TOPES) {
  test(`banner en ${ancho} px: más corto (≤ ${tope} px), igual en todos los banners, sin texto cortado ni controles fuera de pantalla`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await go(page, "/");
    const alturas = new Set<number>();
    for (const id of IDS) {
      await page.getByTestId(`indicador-${id}`).click();
      await expect.poll(() => page.locator("[data-active=true]").getAttribute("data-testid")).toBe(`diapositiva-${id}`);
      const m = await page.evaluate(() => {
        const c = document.querySelector("[data-testid=carrusel]")!;
        const d = document.querySelector("[data-active=true]")!;
        const cortado = [...d.querySelectorAll("h2, p, a")].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent);
        const controles = [...c.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height, ind: !!b.closest("ul") }; });
        return { alto: Math.round(c.getBoundingClientRect().height), cortado, controles, ancho: innerWidth };
      });
      alturas.add(m.alto);
      expect(m.cortado, `${id}: texto cortado`).toEqual([]);
      for (const b of m.controles) { expect(b.l, `${id}: control fuera por la izquierda`).toBeGreaterThanOrEqual(0); expect(b.r, `${id}: control fuera por la derecha`).toBeLessThanOrEqual(m.ancho); expect(Math.min(b.w, b.h), `${id}: zona táctil`).toBeGreaterThanOrEqual(b.ind ? 24 : 40); }
      expect(m.alto, id).toBeLessThanOrEqual(tope);
    }
    expect(alturas.size, "todos los banners miden lo mismo").toBe(1);
    await sinDesborde(page);
    // los formatos aparecen en la primera pantalla: el banner termina antes del borde inferior
    const fin = await page.evaluate(() => { const c = document.querySelector("[data-testid=carrusel]")!.getBoundingClientRect(); return c.bottom + scrollY; });
    expect(fin, "el banner termina dentro de la primera pantalla").toBeLessThan(alto);
    await expect(page.locator("#cat-title")).toBeInViewport();
  });
}

test("los dos botones del banner siguen siendo «Ver productos» y «Galería de cartas» (nombre accesible completo) y caben en una fila en celular", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await go(page, "/");
  const b = page.getByTestId("banner-storm-emeralda");
  const ver = b.getByRole("link", { name: "Ver productos" });
  const gal = b.getByRole("link", { name: "Galería de cartas" });
  const [r1, r2] = await Promise.all([ver.boundingBox(), gal.boundingBox()]);
  expect(Math.abs(r1!.y - r2!.y)).toBeLessThan(4); // misma fila
  expect(r1!.height).toBeGreaterThanOrEqual(44);
});

test("el avance automático, la pausa y el botón siguen funcionando con el banner compacto", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await go(page, "/");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await page.clock.runFor(6100);
  await expect.poll(() => page.locator("[data-active=true]").getAttribute("data-testid")).toBe("diapositiva-30th-celebration");
  await page.getByTestId("carrusel-pausa").click();
  await expect(page.getByTestId("carrusel-pausa")).toHaveAccessibleName(/Reanudar/);
});

test("ficha en celular: nombre e idioma arriba (antes de la galería), precio pendiente en la primera pantalla y galería con zoom", async ({ page, isMobile }) => {
  test.skip(!isMobile, "orden móvil");
  for (const url of ["/productos/zh-kit-mengleigu-ex", "/productos/white-flare-caja", "/productos/storm-emeralda-sobre"]) {
    await go(page, url);
    const h1 = page.getByRole("heading", { level: 1 });
    const box = (await h1.boundingBox())!;
    const y = await page.evaluate(() => scrollY);
    expect(box.y + y, `${url}: el título empieza arriba`).toBeLessThan(260); // antes: ~800–900 px
    const galeria = page.getByRole("button", { name: "Ampliar", exact: true });
    expect((await galeria.boundingBox())!.y, `${url}: la galería viene después del nombre`).toBeGreaterThan(box.y);
    await expect(page.getByTestId("etiquetas").first().getByTestId("etiqueta-idioma")).toBeVisible();
    await expect(page.getByTestId("precio").first()).toHaveText("Precio a confirmar");
    await expect(page.getByTestId("precio").first()).toBeInViewport();
    await expect(page.getByTestId("disponibilidad").first()).toBeInViewport();
    await expect(page.getByRole("button", { name: /Agregar|Consultar por encargo/ }).first()).toBeVisible();
    await galeria.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  }
});

test("ficha: sin repeticiones del idioma, la disponibilidad ni las condiciones de pago", async ({ page }) => {
  await go(page, "/productos/zh-kit-mengleigu-ex");
  const main = page.locator("main");
  // un kit no cuenta como caja: se aclara una sola vez, sin anunciar el beneficio como propio
  await expect(main.getByText("Este formato no cuenta como caja")).toHaveCount(1);
  await expect(main.getByText("3 cuotas sin interés")).toHaveCount(0);
  await expect(main.getByText("Sin stock", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("etiqueta-idioma")).toHaveCount(1);
  await expect(main).not.toContainText("Elegí tu preferencia en el carrito");
  await expect(main).not.toContainText("Disponibilidad e importe final se confirman siempre por WhatsApp");
});

test("desplegables cerrados al inicio (probabilidades, fuentes y detalle de garantías), sin acordeones anidados, y se manejan con el teclado", async ({ page }) => {
  await go(page, "/productos/black-bolt-caja");
  for (const id of ["probabilidades-detalle", "fuentes-detalle", "garantias-detalle"]) await expect(page.getByTestId(id), id).not.toHaveJSProperty("open", true);
  await expect(page.locator("#probabilidades details")).toHaveCount(1); // un solo desplegable, sin otro alrededor
  await expect(page.getByTestId("probabilidades-detalle").locator("summary")).toContainText("Dato no disponible");
  await expect(page.getByTestId("fuentes-detalle").locator("summary")).toContainText(/Fuentes y fecha de revisión \(\d+\)/);
  for (const id of ["probabilidades-detalle", "fuentes-detalle", "garantias-detalle"]) {
    const resumen = page.getByTestId(id).locator("summary");
    await resumen.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId(id), `${id} abre con Enter`).toHaveJSProperty("open", true);
    await page.keyboard.press("Space");
    await expect(page.getByTestId(id), `${id} cierra con Espacio`).toHaveJSProperty("open", false);
  }
  // la información sigue disponible y trazable al abrirlos
  await page.getByTestId("fuentes-detalle").locator("summary").click();
  await expect(page.getByTestId("fuentes-detalle").getByRole("link", { name: /Pokémon Center Online/ }).first()).toBeVisible();
  await page.getByTestId("probabilidades-detalle").locator("summary").click();
  await expect(page.getByTestId("probabilidades-detalle")).toContainText("No es lo mismo una probabilidad que una cantidad garantizada por caja");
});

test("«Qué garantiza esta caja»: contenido físico, composición por sobre y «Rarezas garantizadas: sin confirmación documental», cerca del precio y antes de las cartas", async ({ page }) => {
  for (const [slug, composicion] of [["black-bolt-caja", "2 cartas con acabado brillante"], ["white-flare-caja", "2 cartas con acabado brillante"], ["mega-dream-ex-caja", "1 carta Pokémon ex o Mega Evolution ex"], ["30th-celebration-caja", "1 carta especial de Pikachu"], ["storm-emeralda-caja", ""], ["abyss-eye-caja", ""], ["inferno-x-caja", ""], ["heat-wave-arena-caja", ""]] as const) {
    await go(page, `/productos/${slug}`);
    const r = page.getByTestId("garantias-resumen");
    await expect(r.getByRole("heading", { level: 2 })).toHaveText("Qué garantiza esta caja");
    await expect(r).toContainText("Contenido físico confirmado");
    await expect(r).toContainText("sobres");
    await expect(r).toContainText("Rarezas garantizadas");
    await expect(r).toContainText("Sin confirmación documental");
    await expect(r).toContainText("No significa que no haya un patrón habitual");
    if (composicion) { await expect(r).toContainText(composicion); await expect(r).toContainText(/Cantidad fija|Una de varias alternativas/); }
    // antes de la galería de cartas y después del precio
    const [p, g, c] = await Promise.all([page.getByTestId("precio").first().boundingBox(), r.boundingBox(), page.locator("#cartas").boundingBox()]);
    expect(g!.y).toBeGreaterThan(p!.y);
    const gy = await r.evaluate((el) => el.getBoundingClientRect().top + scrollY), cy = await page.locator("#cartas").evaluate((el) => el.getBoundingClientRect().top + scrollY);
    expect(gy, slug).toBeLessThan(cy);
    void c;
    // el detalle (cerrado) conserva la revisión con fuente, fecha y alcance
    const d = page.getByTestId("revision-rarezas");
    await expect(d).toContainText("Revisado el 13 de octubre de 2026");
    await expect(d).toContainText("Pokémon Center Online");
  }
  await go(page, "/productos/mega-dream-ex-caja");
  await expect(page.getByTestId("garantias-resumen")).toContainText("no se suman");
  await go(page, "/productos/black-bolt-caja");
  await expect(page.getByTestId("garantias-resumen")).toContainText("dos cartas brillantes no equivalen a dos AR ni a una cantidad de AR por caja");
  await expect(page.locator("main")).not.toContainText(/Deluxe/);
});

test("los sobres sueltos NO llevan el encabezado de garantía por caja ni la fila de rarezas", async ({ page }) => {
  for (const slug of ["black-bolt-sobre", "storm-emeralda-sobre", "zh-gongzhu-rongguang-sobre-5"]) {
    await go(page, `/productos/${slug}`);
    const r = page.getByTestId("garantias-resumen");
    await expect(r.getByRole("heading", { level: 2 })).toHaveText("Contenido del sobre");
    await expect(page.locator("main")).not.toContainText("Qué garantiza esta caja");
    await expect(r).not.toContainText("Rarezas garantizadas");
    await expect(r).toContainText("Contenido físico confirmado");
  }
});

test("cajas chinas: conservan la unidad o cantidad pendiente y la revisión del proveedor, sin garantías japonesas", async ({ page }) => {
  await go(page, "/productos/zh-taijing-shengju-caja");
  const r = page.getByTestId("garantias-resumen");
  await expect(r.getByRole("heading", { level: 2 })).toHaveText("Qué garantiza esta caja");
  await expect(r).toContainText("Sobres por caja");
  await expect(r).toContainText("Dato pendiente");
  await expect(r).toContainText("Sin confirmación documental");
  await expect(page.locator("#descripcion")).toContainText("la unidad de venta final se confirma con el proveedor");
  await expect(page.getByTestId("revision-rarezas")).toContainText("no declara rarezas garantizadas");
  await expect(page.getByTestId("revision-rarezas")).toContainText("ni se trasladó ninguna garantía japonesa");
  await expect(r).not.toContainText(/キラ|必ず/);
  // caja especial: composición documentada del sobre incluido
  await go(page, "/productos/zh-caja-ogerpon-agua");
  await expect(page.getByTestId("garantias-resumen").getByRole("heading", { level: 2 })).toHaveText("Qué garantiza esta caja especial");
  await expect(page.getByTestId("garantias-resumen")).toContainText("3 de Pokémon, 1 Pokémon ex fija y 1 de Entrenador");
});

test("kit chino: el contenido aparece una sola vez, la aleatoriedad se limita a sobres y fundas, y el aviso de pendiente no promete cartas", async ({ page }) => {
  await go(page, "/productos/zh-kit-mengleigu-ex");
  const main = page.locator("main");
  await expect(main.getByText("Pack de mejora del mazo")).toHaveCount(1); // antes: en la descripción y en «¿Qué asegura este kit?»
  await expect(page.getByTestId("garantias-resumen").getByRole("heading", { level: 2 })).toHaveText("Qué incluye este kit");
  await expect(page.getByTestId("aleatoriedad")).toContainText("El mazo, los accesorios y las guías son fijos");
  await expect(page.getByTestId("aleatoriedad")).toContainText("Son aleatorias las cartas de los sobres");
  await expect(main).not.toContainText("El contenido de los sobres es aleatorio. Las cantidades indicadas");
  const aviso = page.getByTestId("pendiente-comercial");
  await expect(aviso).toContainText("Sin stock disponible");
  await expect(aviso).not.toContainText("cartas");
});

test("White Flare y Black Bolt: las cajas usan el recorte sin fondo en banner, formatos, catálogo, expansión y ficha (nunca el archivo con fondo blanco)", async ({ page }) => {
  const rutas = (page: Page) => page.evaluate(() => [...document.images].map((i) => decodeURIComponent(i.currentSrc || i.src)).filter((s) => /(white-flare|black-bolt)\/caja-referencia/.test(s)));
  await go(page, "/");
  for (const id of ["white-flare", "black-bolt"]) {
    await page.getByTestId(`indicador-${id}`).click();
    await expect.poll(() => page.getByTestId(`diapositiva-${id}`).locator("img").count()).toBe(3);
    await expect.poll(() => page.getByTestId(`diapositiva-${id}`).locator("img").evaluateAll((l) => l.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  for (const u of await rutas(page)) expect(u).toMatch(/-sin-fondo\.webp/);
  expect((await rutas(page)).length).toBeGreaterThanOrEqual(2);
  for (const url of ["/sellados?q=white+flare", "/sellados?q=black+bolt", "/sellados?expansion=white-flare", "/expansiones/black-bolt", "/productos/white-flare-caja", "/productos/black-bolt-caja"]) {
    await go(page, url);
    await page.evaluate(async () => { const im = [...document.images]; im.forEach((i) => (i.loading = "eager")); await Promise.all(im.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))); });
    const lista = await rutas(page);
    expect(lista.length, `${url}: hay fotos de caja`).toBeGreaterThan(0);
    for (const u of lista) expect(u, url).toMatch(/-sin-fondo\.webp/);
    const rotas = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent !== null).map((i) => i.src));
    expect(rotas, url).toEqual([]);
  }
  // la ficha distingue caja cerrada (primera) de la exhibición abierta (segunda), ambas sin fondo
  await go(page, "/productos/black-bolt-caja");
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("Caja cerrada");
  await page.getByRole("list", { name: "Miniaturas" }).getByRole("button").nth(1).click();
  await expect(page.getByTestId("galeria-etiqueta")).toContainText("Caja abierta de exhibición");
  await expect(page.getByTestId("galeria-exhibicion")).toBeVisible();
});

test("no quedan rectángulos blancos: el fondo de las cajas sin fondo se ve a través (píxeles de la esquina del recuadro = color de la tarjeta)", async ({ page }) => {
  await go(page, "/productos/white-flare-caja");
  const r = await page.evaluate(async () => {
    const img = [...document.images].find((i) => /white-flare\/caja-referencia-2/.test(decodeURIComponent(i.currentSrc)))!;
    await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!; g.drawImage(img, 0, 0);
    const px = (x: number, y: number) => g.getImageData(x, y, 1, 1).data[3];
    return { esquinas: [px(3, 3), px(c.width - 4, 3), px(3, c.height - 4), px(c.width - 4, c.height - 4)], centro: px(Math.round(c.width / 2), Math.round(c.height / 2)) };
  });
  expect(r.esquinas).toEqual([0, 0, 0, 0]);
  expect(r.centro).toBe(255);
});
