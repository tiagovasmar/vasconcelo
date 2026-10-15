import { expect, test, type Page } from "@playwright/test";
import { go } from "./helpers";

// Avance automático del carrusel del inicio (cada 6 s). El reloj del navegador es simulado (page.clock) para no esperar tiempos reales.
// Servidor con el catálogo REAL; escritorio y móvil.
const ORDEN = ["storm-emeralda", "30th-celebration", "abyss-eye", "mega-dream-ex", "inferno-x", "heat-wave-arena", "white-flare", "black-bolt"];
const activo = async (page: Page) => (await page.locator("[data-testid^=diapositiva-][data-active=true]").getAttribute("data-testid"))!.replace("diapositiva-", "");
const MS = 6000;
/** Saca el mouse y el foco del carrusel (en el móvil emulado un clic también deja el «mouse» encima). */
async function salir(page: Page, reanuda = true) {
  await page.getByRole("link", { name: "Cómo comprar" }).first().focus();
  await page.evaluate(() => window.scrollTo(0, 0)); // arriba de todo: el punto (5, 5) cae en la cabecera, fuera del carrusel
  await page.mouse.move(5, 5);
  // espera a que React haya reanudado (y creado el temporizador) antes de avanzar el reloj simulado
  if (reanuda) await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
}

/** Abre el inicio con movimiento normal y reloj simulado (el movimiento reducido es la configuración por defecto de las pruebas). */
async function abrir(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install();
  await go(page, "/");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  // El reloj simulado corre solo con el tiempo real: bajo carga (suite completa) el primer avance podía dispararse antes de la primera
  // comprobación. Se congela acá y, desde este punto, el tiempo solo avanza con page.clock.runFor.
  // (pauseAt no admite el pasado: si la carga ya dejó atrás el margen, se prueba con uno mayor).
  for (const margen of [300, 1000, 2000]) {
    const ahora = await page.evaluate(() => Date.now());
    try { await page.clock.pauseAt(ahora + margen); break; } catch (e) { if (margen === 2000) throw e; }
  }
}
/** Espera (en tiempo real, no simulado) a que el desplazamiento suave termine: el reloj simulado salta, pero el scroll del navegador no. */
const asentado = (page: Page) => expect.poll(() => page.evaluate(() => {
  const t = document.querySelector("[data-testid=carrusel-pista]")!;
  const i = [...document.querySelectorAll("[data-testid^=diapositiva-]")].findIndex((e) => e.getAttribute("data-active") === "true");
  return Math.abs(t.scrollLeft - i * t.clientWidth) < 2;
})).toBe(true);
const avanzar = async (page: Page, ms: number) => { await page.clock.runFor(ms); await asentado(page); };

test("avanza cada 6 segundos y, tras el último banner, vuelve al primero", async ({ page }) => {
  await abrir(page);
  expect(await activo(page)).toBe("storm-emeralda");
  await avanzar(page, MS / 3); // con el reloj congelado alcanza con un margen: no se mide el límite exacto
  expect(await activo(page)).toBe("storm-emeralda");
  await avanzar(page, MS);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
  for (const id of ORDEN.slice(2)) {
    await avanzar(page, MS + 100);
    await expect.poll(() => activo(page), id).toBe(id);
  }
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("storm-emeralda"); // vuelve al primero
});

test("el avance automático no roba el foco ni se anuncia a lectores de pantalla; el manual sí se anuncia", async ({ page }) => {
  await abrir(page);
  const fuera = page.getByRole("link", { name: "Cómo comprar" }).first();
  await fuera.focus();
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
  await expect(fuera).toBeFocused();
  await expect(page.getByTestId("carrusel-anuncio")).toHaveText("");
  await page.getByTestId("carrusel-siguiente").click();
  await expect(page.getByTestId("carrusel-anuncio")).toHaveText(/Banner 3 de 8: Abyss Eye/);
});

test("se pausa con el mouse encima y se reanuda al sacarlo", async ({ page, isMobile }) => {
  test.skip(isMobile, "el mouse no existe en el móvil táctil");
  await abrir(page);
  const caja = (await page.getByTestId("carrusel").boundingBox())!;
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 120);
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await avanzar(page, MS * 2);
  expect(await activo(page)).toBe("storm-emeralda");
  await page.mouse.move(5, 5);
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
});

test("se pausa con el foco dentro del carrusel y se reanuda al salir", async ({ page }) => {
  await abrir(page);
  await page.getByTestId("banner-storm-emeralda").getByRole("link", { name: "Ver productos" }).focus();
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await avanzar(page, MS * 2);
  expect(await activo(page)).toBe("storm-emeralda");
  await page.getByRole("link", { name: "Cómo comprar" }).first().focus();
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
});

test("se pausa con la pestaña oculta", async ({ page }) => {
  await abrir(page);
  const estado = (v: "hidden" | "visible") => page.evaluate((s) => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => s }); document.dispatchEvent(new Event("visibilitychange")); }, v);
  await estado("hidden");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await avanzar(page, MS * 2);
  expect(await activo(page)).toBe("storm-emeralda");
  await estado("visible");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
});

test("el botón de pausa/reanudar es accesible y la pausa manual se conserva al quitar el mouse o el foco", async ({ page }) => {
  await abrir(page);
  const pausa = page.getByTestId("carrusel-pausa");
  await expect(pausa).toHaveAccessibleName("Pausar el avance automático de los banners");
  await pausa.click();
  await expect(pausa).toHaveAccessibleName("Reanudar el avance automático de los banners");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await salir(page, false); // el mouse y el foco salen del carrusel: la pausa de la persona sigue
  await avanzar(page, MS * 3);
  expect(await activo(page)).toBe("storm-emeralda");
  await pausa.click();
  await expect(pausa).toHaveAccessibleName("Pausar el avance automático de los banners");
  await salir(page);
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
});

test("la navegación manual reinicia la cuenta de 6 segundos", async ({ page }) => {
  await abrir(page);
  await avanzar(page, 3000); // la mitad de la cuenta
  expect(await activo(page)).toBe("storm-emeralda");
  await page.getByTestId("carrusel-siguiente").click();
  await expect.poll(() => activo(page)).toBe("30th-celebration");
  await asentado(page);
  await salir(page); // saca el mouse y el foco del carrusel para que la cuenta corra
  await avanzar(page, 3000); // con la cuenta anterior ya habría avanzado (3 s + 3 s); con la cuenta reiniciada pasaron solo 3 s
  expect(await activo(page)).toBe("30th-celebration");
  await avanzar(page, MS);
  await expect.poll(() => activo(page)).toBe("abyss-eye");
});

test("con movimiento reducido arranca detenido y no avanza solo; el botón permite activarlo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await go(page, "/");
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "off");
  await avanzar(page, MS * 3);
  expect(await activo(page)).toBe("storm-emeralda");
  await page.getByTestId("carrusel-pausa").click();
  await salir(page);
  await expect(page.getByTestId("carrusel")).toHaveAttribute("data-autoplay", "on");
  await avanzar(page, MS + 100);
  await expect.poll(() => activo(page)).toBe("30th-celebration");
});

test("al salir del inicio no queda ningún temporizador del carrusel pendiente", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const w = window as unknown as { __t: Set<number> };
    w.__t = new Set();
    const set = window.setTimeout.bind(window);
    const clear = window.clearTimeout.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...a: unknown[]) => {
      const id = set((...x: unknown[]) => { w.__t.delete(id); (fn as (...y: unknown[]) => void)(...x); }, ms, ...a) as unknown as number;
      if (ms === 6000) w.__t.add(id);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => { if (id !== undefined) w.__t.delete(id); clear(id); }) as typeof window.clearTimeout;
  });
  await go(page, "/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __t: Set<number> }).__t.size)).toBe(1); // un solo temporizador a la vez
  await page.getByRole("link", { name: "Cómo comprar" }).first().click(); // navegación del lado del cliente: el carrusel se desmonta
  await expect(page).toHaveURL(/\/como-comprar/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __t: Set<number> }).__t.size)).toBe(0);
});

test("sin saltos de altura: todos los banners miden lo mismo mientras el carrusel avanza", async ({ page }) => {
  await abrir(page);
  const altura = () => page.getByTestId("carrusel").evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const h0 = await altura();
  for (const id of ORDEN) {
    await page.getByTestId(`indicador-${id}`).click();
    await expect.poll(() => activo(page)).toBe(id);
    expect(Math.abs((await altura()) - h0), id).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});
