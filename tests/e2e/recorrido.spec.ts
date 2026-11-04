import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { go } from "./helpers";
import { PASSWORD, logoutApi, loginUI, newEmail, signUp, test, waitForMail } from "./account-helpers";

// Recorridos de punta a punta con el servidor en modo demo (sin teléfono de WhatsApp): navegación, enlaces y cuenta.

test("todos los enlaces internos del inicio, la cabecera y el pie llevan a una página real", async ({ page, isMobile }) => {
  await go(page, "/");
  if (isMobile) await page.locator("summary[aria-label=Menú]").click();
  const hrefs = await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => a.getAttribute("href")!))].filter((h) => h.startsWith("/")));
  expect(hrefs.length).toBeGreaterThan(15);
  for (const href of hrefs) {
    const [path, hash] = href.split("#");
    const res = await go(page, path || "/");
    expect(res?.status(), `${href} respondió ${res?.status()}`).toBe(200);
    const h1 = (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
    expect(h1, `${href}: título vacío`).not.toBe("");
    expect(h1, `${href} es un 404 o una página en construcción`).not.toMatch(/No encontramos esa página|Próximamente|En desarrollo/i);
    await expect(page.getByText("Próximamente"), `${href} muestra «Próximamente»`).toHaveCount(0);
    if (hash) await expect(page.locator(`#${hash}`), `${href}: no existe el ancla #${hash}`).toHaveCount(1);
  }
  // el pie incluye los textos legales y «Cómo comprar»
  const footer = page.getByRole("contentinfo");
  for (const name of ["Todos los sellados", "Expansiones", "Carrito", "Cómo comprar", "Envíos y retiros", "Mi cuenta", "Privacidad", "Condiciones"]) {
    await expect(footer.getByRole("link", { name })).toBeVisible();
  }
});

test("Cómo comprar, Privacidad y Condiciones: contenido real, borradores identificados y sin datos inventados", async ({ page }) => {
  await go(page, "/como-comprar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("De tu carrito");
  await expect(page.getByRole("heading", { name: "Envíos y retiros" })).toBeVisible();
  await page.getByText("¿Pago en la web?").click();
  await expect(page.getByText("En el sitio no se cobra nada")).toBeVisible();
  for (const [url, title] of [["/privacidad", "Privacidad."], ["/condiciones", "Condiciones."]] as const) {
    await go(page, url);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByTestId("aviso-borrador")).toContainText("Borrador");
    const text = await page.locator("main").innerText();
    expect(text).toContain("[A completar por el comercio]"); // los datos legales faltantes no se inventan
    expect(text).not.toMatch(/CUIT[^\n]*\d{2}-\d{8}-\d/);
  }
});

test("recorrido completo: catálogo → ficha → carrito → consulta (modo demo)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
  await go(page, "/");
  await page.getByRole("link", { name: "Ver todo el catálogo" }).click();
  await page.locator("html[data-hydrated='true']").waitFor();
  await expect(page).toHaveURL(/\/sellados/);
  await page.getByRole("link", { name: "Storm Emeralda · Caja" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Storm Emeralda · Caja/);
  await expect(page.locator("#contenido")).toContainText("30 sobres de 5 cartas por caja");
  await page.getByRole("button", { name: "Más" }).click();
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.getByTestId("cart-count")).toHaveText("2");
  await page.getByTestId("drawer-continuar").click();
  await expect(page).toHaveURL(/\/carrito$/);
  await expect(page.getByTestId("resumen-subtotal")).toContainText("370.000");
  await expect(page.getByTestId("resumen-envio")).toHaveText("A coordinar");
  await page.getByLabel(/^Moto/).check();
  await page.getByLabel("Localidad").fill("Ramos Mejía");
  await page.getByLabel("Código postal").fill("1704");
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
  await expect(page.getByTestId("modo-demo")).toBeVisible();
  await expect(page.getByTestId("mensaje")).toContainText("2 × Storm Emeralda · Caja [Japonés]");
  await expect(page.getByTestId("mensaje")).toContainText("Entrega: Moto CABA/AMBA · Ramos Mejía (CP 1704) · cobertura a confirmar");
  await expect(page.getByText("Todavía no enviaste nada.")).toBeVisible();
});

test("recorrido con cuenta: registro → favoritos → consulta → Mis consultas → recuperación → ingreso", async ({ page }) => {
  const email = newEmail("viaje");
  const nueva = "clave-nueva-muy-segura-9";

  // registro por la interfaz y confirmación con el correo local
  await go(page, "/cuenta/registro");
  await page.getByLabel("Nombre").fill("Valeria Sosa");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repetí la contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL(/\/cuenta$/);

  // favorito desde la ficha
  await go(page, "/productos/storm-emeralda-pack-5-sobres");
  await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/favorites") && r.ok()), page.getByRole("button", { name: /Guardar .* en favoritos/ }).first().click()]);

  // consulta con la sesión iniciada (el nombre del perfil se aprovecha)
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await go(page, "/carrito");
  await expect(page.getByLabel(/Nombre y apellido/)).toHaveValue("Valeria Sosa");
  await page.getByRole("radio", { name: /Retiro/ }).check();
  await page.getByLabel(/Nombre y apellido/).fill("Ana Pérez");
  await page.getByRole("radio", { name: /Efectivo/ }).check();
  await page.getByRole("button", { name: "Continuar por WhatsApp" }).click();
  await expect(page).toHaveURL(/\/carrito\/consulta\/TT-/);
  const ref = page.url().match(/TT-[A-Z2-9]{8}/)![0];

  // Mis consultas la muestra como consulta preparada (no como compra pagada)
  await go(page, "/cuenta/consultas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Mis consultas/i);
  await expect(page.getByRole("link", { name: new RegExp(ref) })).toContainText("Consulta preparada");
  await go(page, "/cuenta/favoritos");
  await expect(page.getByRole("link", { name: "Pack de 5 sobres · Storm Emeralda" }).first()).toBeVisible();

  // salir, recuperar la contraseña y volver a entrar: todo sigue ahí
  await logoutApi(page);
  await go(page, "/cuenta/recuperar");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByRole("button", { name: "Enviarme el enlace" }).click();
  await expect(page.getByTestId("recuperar-ok")).toBeVisible();
  await go(page, (await waitForMail(email, "recuperacion")).link);
  await page.getByLabel("Contraseña nueva").fill(nueva);
  await page.getByLabel("Repetí la contraseña").fill(nueva);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page.getByTestId("reset-ok")).toBeVisible();
  await loginUI(page, email, nueva);
  await expect(page).toHaveURL(/\/cuenta$/);
  await go(page, "/cuenta/consultas");
  await expect(page.getByRole("link", { name: new RegExp(ref) })).toBeVisible();
  await go(page, "/cuenta/favoritos");
  await expect(page.locator("main ul.grid > li")).toHaveCount(1);
});

test("accesibilidad (axe) de las pantallas con sesión iniciada", async ({ page }) => {
  await signUp(page, "Ana Axe", newEmail("axe"));
  for (const url of ["/cuenta", "/cuenta/consultas", "/cuenta/favoritos", "/cuenta/perfil"]) {
    await go(page, url);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${url}: ${v.id} → ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  }
});

test("teclado: «Saltar al contenido» lleva al contenido principal", async ({ page, isMobile }) => {
  test.skip(isMobile, "escritorio");
  await go(page, "/sellados");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#principal$/);
});
