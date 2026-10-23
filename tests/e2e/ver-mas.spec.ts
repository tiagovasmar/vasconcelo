import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";
import { go } from "./helpers";

// Servidor «extra» (:3105): catálogo de prueba + 12 sobres de prueba extra (DEMO_EXTRA_BOOSTERS=12) y base propia. Verifica el «Ver más» del selector de sobres de la ficha
// de una caja con 15 opciones elegibles: que muestre solo las primeras, que al expandir o contraer se conserve lo elegido (tipos y cantidades) y que se pueda usar con teclado.
const stamp = process.env.E2E_STAMP!;
const BASE = "http://localhost:3105";
const OWNER = "dueno-e2e@example.com";
const PASSWORD = "contraseña-segura-123";
const mailDir = path.resolve(`.local/data/e2e-${stamp}-extra-mail`);
const FICHA = "/productos/storm-emeralda-caja";

const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const test = base.extend<{ ip: string }>({
  ip: async ({}, provide) => provide(randomIp()),
  page: async ({ page, ip }, provide) => {
    await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
    await provide(page);
  },
});
test.describe.configure({ mode: "serial" });

async function verificationLink(to: string): Promise<string> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const found = fs.existsSync(mailDir) ? fs.readdirSync(mailDir).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mailDir, f), "utf8")) as { to: string; kind: string; link: string }).filter((m) => m.to === to && m.kind === "verificacion") : [];
    if (found.length) return found[found.length - 1].link;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`No llegó el correo de confirmación para ${to}`);
}
async function ownerSession(page: Page) {
  const signIn = () => page.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: OWNER, password: PASSWORD }, headers: { Origin: BASE } });
  if ((await signIn()).ok()) return;
  const up = await page.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Dueño de la Tienda", email: OWNER, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: BASE } });
  if (up.ok()) {
    await go(page, await verificationLink(OWNER));
    return;
  }
  for (let i = 0; i < 20; i++) {
    if ((await signIn()).ok()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("No se pudo iniciar la sesión del dueño");
}

const caps = (page: Page) => page.locator("[data-testid=adicionales-sobres] ul > li");
const verMas = (page: Page) => page.getByTestId("adicionales-ver-mas");
const cupos = (page: Page) => page.getByTestId("adicionales-cupos");
const ids = async (page: Page) => caps(page).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!.replace("adicional-", "")));
const qtyOf = async (page: Page, id: string) => Number(await page.getByTestId(`adicional-cantidad-${id}`).innerText());
const selected = async (page: Page) => caps(page).evaluateAll((els) => els.filter((e) => (e as HTMLElement).dataset.selected === "true").map((e) => (e as HTMLElement).dataset.testid!.replace("adicional-", "")));

test("el dueño configura la promoción con la caja y los 15 sobres de prueba (solo en la base aislada)", async ({ page }) => {
  await ownerSession(page);
  await go(page, "/admin/promociones");
  await page.getByTestId("combo-cajas-storm-caja").check();
  await page.getByRole("button", { name: /^Elegir los \d+ que se ven$/ }).nth(1).click(); // sobres: todos los visibles
  await expect(page.getByTestId("sobres-cuenta")).toContainText("15 elegidos");
  await page.getByTestId("combo-activada").check();
  await page.getByTestId("combo-guardar").click();
  await expect(page.getByTestId("combo-mensaje")).toContainText("ACTIVADA");
});

for (const [label, width, height] of [["escritorio", 1440, 900], ["móvil 360", 360, 800], ["móvil 390", 390, 844], ["móvil 430", 430, 900]] as const) {
  test(`«Ver más» (${label}): muestra 6 de 15, conserva tipos y cantidades al expandir y contraer, y se usa con teclado`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await go(page, FICHA);
    await page.locator("html[data-hydrated='true']").waitFor();

    // 15 elegibles: se ven 6 y el botón ofrece los 9 restantes; nada viene elegido
    await expect(caps(page)).toHaveCount(6);
    await expect(verMas(page)).toHaveText("Ver 9 más");
    await expect(verMas(page)).toHaveAttribute("aria-expanded", "false");
    await expect(cupos(page)).toContainText("0 elegidos · te quedan 5 cupos");
    expect(await selected(page)).toEqual([]);
    const primeros = await ids(page);

    // elegir dos tipos entre los visibles, uno con cantidad 2
    const [a, b] = primeros;
    await page.getByTestId(`adicional-elegir-${a}`).click();
    await page.getByTestId(`adicional-mas-${a}`).click();
    await page.getByTestId(`adicional-elegir-${b}`).click();
    await expect(cupos(page)).toContainText("3 elegidos · te quedan 2 cupos");

    // expandir: aparecen los 15, lo elegido sigue elegido con sus cantidades y el botón pasa a «Ver menos»
    await verMas(page).click();
    await expect(caps(page)).toHaveCount(15);
    await expect(verMas(page)).toHaveText("Ver menos");
    await expect(verMas(page)).toHaveAttribute("aria-expanded", "true");
    expect((await ids(page)).slice(0, 6)).toEqual(primeros); // el orden no cambia al expandir
    expect(await selected(page)).toEqual([a, b]);
    expect(await qtyOf(page, a)).toBe(2);
    expect(await qtyOf(page, b)).toBe(1);

    // elegir uno de los que estaban ocultos (el último de la lista) y sumarle una unidad
    const todos = await ids(page);
    const oculto = todos[todos.length - 1];
    await page.getByTestId(`adicional-elegir-${oculto}`).click();
    await page.getByTestId(`adicional-mas-${oculto}`).click();
    await expect(cupos(page)).toContainText("5 elegidos · sin cupos libres");
    // sin cupos: ninguna opción nueva se puede elegir (también entre las que estaban ocultas) y los «+» se detienen
    await expect(page.getByTestId(`adicional-elegir-${todos[7]}`)).toBeDisabled();
    await expect(page.getByTestId(`adicional-mas-${a}`)).toBeDisabled();

    // contraer: vuelven los 6 primeros, pero lo elegido que estaba oculto sigue visible (nunca se pierde una selección); las cantidades se conservan
    await verMas(page).click();
    await expect(caps(page)).toHaveCount(7);
    await expect(verMas(page)).toHaveText("Ver 8 más");
    await expect(verMas(page)).toHaveAttribute("aria-expanded", "false");
    expect(await selected(page)).toEqual([a, b, oculto]);
    expect(await qtyOf(page, a)).toBe(2);
    expect(await qtyOf(page, b)).toBe(1);
    expect(await qtyOf(page, oculto)).toBe(2);
    await expect(cupos(page)).toContainText("5 elegidos · sin cupos libres");

    // bajar la cantidad del oculto a 0 lo deselecciona; al contraer de nuevo ya no se muestra
    await page.getByTestId(`adicional-menos-${oculto}`).click();
    await page.getByTestId(`adicional-menos-${oculto}`).click();
    await expect(cupos(page)).toContainText("3 elegidos · te quedan 2 cupos");
    await expect(page.getByTestId(`adicional-${oculto}`)).toHaveAttribute("data-selected", "false"); // sigue visible (no desaparece bajo el dedo)
    await expect(caps(page)).toHaveCount(7);
    await verMas(page).click(); // expandir
    await verMas(page).click(); // contraer
    await expect(caps(page)).toHaveCount(6);
    expect(await selected(page)).toEqual([a, b]);

    // el desglose del servidor suma exactamente lo elegido: 3 sobres con 10% OFF
    const total = page.getByTestId("desglose-total");
    await expect(total).toBeVisible();
    await expect(page.getByTestId("desglose-ahorro")).toBeVisible();

    // sin desbordes ni superposiciones, con 15 opciones abiertas
    await verMas(page).click();
    const m = await page.evaluate(() => {
      const r = Array.from(document.querySelectorAll("[data-testid=adicionales-sobres] ul > li")).map((e) => { const x = e.getBoundingClientRect(); return { t: x.top, b: x.bottom, l: x.left, r: x.right }; });
      const vw = window.innerWidth;
      const offenders = Array.from(document.querySelectorAll("main *")).filter((e) => e.getBoundingClientRect().right > vw + 1 && getComputedStyle(e).position !== "fixed").sort((x, y) => y.getBoundingClientRect().right - x.getBoundingClientRect().right).slice(0, 8).map((e) => `${e.tagName.toLowerCase()}${(e as HTMLElement).dataset.testid ? "[" + (e as HTMLElement).dataset.testid + "]" : ""}.${String(e.className).slice(0, 60)} → ${Math.round(e.getBoundingClientRect().right)} «${(e.textContent ?? "").trim().slice(0, 40)}» en ${e.closest("header,footer,main,nav,aside,section")?.tagName ?? "?"}`);
      return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, caps: r, vw, offenders };
    });
    expect(m.overflow, `desborde horizontal; elementos que se pasan: ${m.offenders.join(" | ")}`).toBeLessThanOrEqual(1);
    for (const c of m.caps) { expect(c.l).toBeGreaterThanOrEqual(0); expect(c.r).toBeLessThanOrEqual(m.vw + 1); }
    for (let i = 1; i < m.caps.length; i++) expect(m.caps[i].t).toBeGreaterThanOrEqual(m.caps[i - 1].b - 1);
  });
}

test("teclado y lectores de pantalla: «Ver más» es un botón con estado, el foco no se pierde al expandir o contraer y no hay problemas de accesibilidad", async ({ page }) => {
  test.setTimeout(90_000);
  await go(page, FICHA);
  await page.locator("html[data-hydrated='true']").waitFor();
  await verMas(page).focus();
  await page.keyboard.press("Enter");
  await expect(verMas(page)).toHaveAttribute("aria-expanded", "true");
  await expect(verMas(page)).toBeFocused(); // el foco queda en el botón (no salta al comienzo ni se pierde)
  await expect(caps(page)).toHaveCount(15);
  await page.keyboard.press("Space");
  await expect(verMas(page)).toHaveAttribute("aria-expanded", "false");
  await expect(verMas(page)).toBeFocused();
  await expect(caps(page)).toHaveCount(6);
  // con teclado se elige una opción y se ajusta la cantidad
  const [a] = await ids(page);
  await page.getByTestId(`adicional-elegir-${a}`).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId(`adicional-${a}`)).toHaveAttribute("data-selected", "true");
  await verMas(page).click();
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(res.violations.map((v) => `${v.id} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ") + " [" + (n.any[0]?.message ?? "") + "]").join(" | ")}`)).toEqual([]);
});

test("agregar con la lista expandida lleva al carrito exactamente lo elegido, también lo que estaba oculto", async ({ page }) => {
  await go(page, FICHA);
  await page.locator("html[data-hydrated='true']").waitFor();
  await verMas(page).click();
  const todos = await ids(page);
  const primero = todos[0];
  const ultimo = todos[todos.length - 1];
  await page.getByTestId(`adicional-elegir-${primero}`).click();
  await page.getByTestId(`adicional-elegir-${ultimo}`).click();
  await page.getByTestId(`adicional-mas-${ultimo}`).click();
  await verMas(page).click(); // contraer con una selección oculta
  await page.getByTestId("agregar").click();
  const drawer = page.getByTestId("cart-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId("drawer-linea-storm-caja")).toBeVisible();
  await expect(drawer.getByTestId(`drawer-cantidad-${primero}`)).toHaveValue("1");
  await expect(drawer.getByTestId(`drawer-cantidad-${ultimo}`)).toHaveValue("2");
  await expect(drawer.getByTestId("drawer-cupos")).toContainText("3 de 5 cupos usados");
  // los precios del selector y del carrito coinciden: el ahorro del carrito es el 10% de lo elegido
  await expect(drawer.getByTestId("drawer-descuento-combo")).toBeVisible();
});
