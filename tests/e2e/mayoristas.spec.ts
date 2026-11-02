import { expect } from "@playwright/test";
import { newEmail, ORIGIN, PASSWORD, signUp, test, waitForMail } from "./account-helpers";
import { go } from "./helpers";

// Servidor «demo» (sin ADMIN_EMAIL: el panel del dueño está cerrado). Cada prueba usa su propia IP de origen.
const datos = { businessName: "Cartas del Oeste", locality: "Ramos Mejía", province: "Buenos Aires", note: "Cajas de las ediciones chinas" };

test.describe("página informativa", () => {
  test("presenta el catálogo por pedido con precios por tramo, las condiciones por definir y nada del 30%, sin prometer stock, plazos ni descuento activo", async ({ page }) => {
    await go(page, "/mayoristas");
    const main = page.locator("main");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pedidos por cantidad");
    await expect(main).toContainText("exclusivamente por pedido");
    await expect(main).toContainText("aprueba a mano");
    await expect(main).toContainText("sin descuento adicional");
    await expect(main).toContainText("seña del 20%");
    await expect(page.getByTestId("mayorista-pendiente")).toContainText("La compra mínima");
    await expect(page.getByTestId("mayorista-pendiente")).toContainText("combinar productos");
    await expect(page.getByTestId("mayorista-pendiente")).toContainText("Las demoras estimadas");
    // el 30% ya no existe en ninguna parte y no se promete nada que el dueño no dio
    await expect(main).not.toContainText(/30 ?%/);
    await expect(main).not.toContainText(/stock garantizado|entrega garantizada|importación asegurada|plazo de d/i);
    await expect(main).toContainText("no la activa al instante");
    await expect(page.getByTestId("solicitar-cuenta-mayorista")).toHaveAttribute("href", "/mayoristas/solicitar");
    await expect(page.getByTestId("mayorista-catalogo-link")).toHaveAttribute("href", "/mayoristas/catalogo");
  });

  test("hay acceso desde el pie, el menú y una llamada breve en el inicio", async ({ page, isMobile }) => {
    await go(page, "/");
    await expect(page.getByTestId("llamada-mayoristas")).toContainText("Pedidos por cantidad");
    await expect(page.getByTestId("llamada-mayoristas")).not.toContainText(/30 ?%/);
    await expect(page.getByTestId("llamada-mayoristas").getByRole("link", { name: /Ver mayoristas/ })).toHaveAttribute("href", "/mayoristas");
    await expect(page.getByRole("contentinfo").getByRole("link", { name: "Mayoristas" })).toHaveAttribute("href", "/mayoristas");
    if (isMobile) {
      await page.getByRole("button", { name: "Menú" }).or(page.locator("summary[aria-label=Menú]")).first().click();
      await expect(page.getByRole("navigation", { name: "Móvil" }).getByRole("link", { name: /Mayoristas/ })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Mayoristas" })).toHaveAttribute("href", "/mayoristas");
    }
  });
});

test.describe("solicitud de cuenta mayorista", () => {
  test("visitante: ve las dos opciones y la API exige sesión", async ({ page, request }) => {
    await go(page, "/mayoristas/solicitar");
    await expect(page.getByTestId("mayorista-sin-sesion").getByRole("link", { name: /Ya tengo cuenta/ })).toHaveAttribute("href", /\/cuenta\/ingresar\?next=%2Fmayoristas%2Fsolicitar/);
    await expect(page.getByTestId("mayorista-sin-sesion").getByRole("link", { name: /Crear cuenta/ })).toHaveAttribute("href", /\/cuenta\/registro\?next=%2Fmayoristas%2Fsolicitar/);
    await expect(page.getByTestId("form-mayorista")).toHaveCount(0);
    expect((await request.get("/api/mayoristas/solicitud")).status()).toBe(401);
    const post = await request.post("/api/mayoristas/solicitud", { data: datos, headers: { Origin: ORIGIN } });
    expect(post.status()).toBe(401);
  });

  test("cuenta común: completa el formulario, queda PENDIENTE (sin descuento), se ve en Mi cuenta y no se puede duplicar", async ({ page }) => {
    const email = newEmail("mayor");
    await signUp(page, "Ana Mayor", email);
    await go(page, "/mayoristas/solicitar");
    await page.getByRole("button", { name: "Enviar solicitud" }).click(); // vacío: errores en español
    await expect(page.getByText("Contanos tu nombre comercial o actividad.")).toBeVisible();
    await expect(page.getByText("Ingresá tu localidad.")).toBeVisible();
    await expect(page.getByText("Elegí una provincia.")).toBeVisible();
    await page.getByLabel("Nombre comercial o actividad").fill(datos.businessName);
    await page.getByLabel("Localidad").fill(datos.locality);
    await page.getByLabel("Provincia").selectOption(datos.province);
    await page.getByLabel(/Artículos o volumen/).fill(datos.note);
    await page.getByRole("button", { name: "Enviar solicitud" }).click();
    const estado = page.getByTestId("estado-mayorista");
    await expect(estado).toBeVisible();
    await expect(page.getByTestId("estado-mayorista-texto")).toHaveText("Pendiente de revisión");
    await expect(estado).toContainText("no ves precios mayoristas");
    await expect(estado).toContainText(/MY-[A-Z2-9]{8}/);
    await expect(estado).not.toContainText(/descuento activo|30% activo/i);
    const ref = (await estado.textContent())!.match(/MY-[A-Z2-9]{8}/)![0];

    // persiste: al recargar se ve el estado y no el formulario
    await page.reload();
    await expect(page.getByTestId("estado-mayorista")).toContainText(ref);
    await expect(page.getByTestId("form-mayorista")).toHaveCount(0);
    // se ve en Mi cuenta
    await go(page, "/cuenta");
    await expect(page.getByTestId("card-mayorista-estado")).toHaveText("Pendiente de revisión");
    // sin duplicados: repetir la solicitud devuelve la misma y no pisa los datos
    const otra = await page.request.post("/api/mayoristas/solicitud", { data: { ...datos, businessName: "Otro nombre" }, headers: { Origin: ORIGIN } });
    expect(otra.status()).toBe(200);
    const j = await otra.json();
    expect(j.replayed).toBe(true);
    expect(j.request.reference).toBe(ref);
    expect(j.request.businessName).toBe(datos.businessName);
    // el estado no lo decide el navegador: no hay forma de enviarlo en el cuerpo
    const intento = await page.request.post("/api/mayoristas/solicitud", { data: { ...datos, status: "aprobada", userId: "otro", discountPercent: 90 }, headers: { Origin: ORIGIN } });
    expect((await intento.json()).request.status).toBe("pendiente");
  });

  test("cuenta sin solicitud: Mi cuenta ofrece solicitarla y los datos inválidos se rechazan en el servidor", async ({ page }) => {
    await signUp(page, "Beto Cuenta", newEmail("beto"));
    await go(page, "/cuenta");
    await expect(page.getByTestId("card-mayorista-estado")).toHaveText("Sin solicitar");
    for (const mal of [{ ...datos, businessName: "" }, { ...datos, province: "Atlántida" }, { ...datos, note: "x".repeat(501) }]) {
      const r = await page.request.post("/api/mayoristas/solicitud", { data: mal, headers: { Origin: ORIGIN } });
      expect(r.status()).toBe(400);
    }
    const sinOrigen = await page.request.post("/api/mayoristas/solicitud", { data: datos, headers: { Origin: "https://otro-sitio.example" } });
    expect(sinOrigen.status()).toBe(403);
  });

  test("persona nueva: crea la cuenta desde la solicitud, confirma el correo y vuelve a la solicitud sin crear otra cuenta", async ({ page }) => {
    const email = newEmail("nueva");
    await go(page, "/cuenta/registro?next=%2Fmayoristas%2Fsolicitar");
    await page.getByLabel("Nombre", { exact: true }).fill("Persona Nueva");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Repetí la contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByTestId("registro-ok")).toBeVisible();
    const mail = await waitForMail(email, "verificacion");
    await go(page, mail.link);
    await expect(page.getByTestId("verificacion-ok")).toBeVisible();
    await page.getByTestId("verificacion-ok").getByRole("link", { name: "Continuar" }).click();
    await expect(page).toHaveURL(/\/mayoristas\/solicitar$/);
    await expect(page.getByTestId("form-mayorista")).toBeVisible();
  });
});

test.describe("permisos", () => {
  test("un mayorista solicitante no recibe permisos administrativos ni puede revisar solicitudes", async ({ page, request }) => {
    // sin sesión
    expect((await request.patch("/api/admin/mayoristas/MY-ABCDEFGH", { data: { status: "aprobada" }, headers: { Origin: ORIGIN } })).status()).toBe(401);
    // con sesión de una cuenta común (este servidor no tiene ADMIN_EMAIL: el panel está cerrado para todos)
    await signUp(page, "Solicitante", newEmail("solic"));
    await page.request.post("/api/mayoristas/solicitud", { data: datos, headers: { Origin: ORIGIN } });
    const r = await page.request.patch("/api/admin/mayoristas/MY-ABCDEFGH", { data: { status: "aprobada" }, headers: { Origin: ORIGIN } });
    expect(r.status()).toBe(403);
    const res = await page.goto("/admin/mayoristas");
    expect(res?.status()).toBe(404);
    await go(page, "/cuenta");
    await expect(page.getByTestId("link-admin")).toHaveCount(0);
  });
});
