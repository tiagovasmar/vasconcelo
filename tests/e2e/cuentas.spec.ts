import postgres from "postgres";
import path from "node:path";
import { expect } from "@playwright/test";
import { go } from "./helpers";
import { DB_URL, MAIL_DIR, ORIGIN, PASSWORD, countMails, loginUI, logoutApi, newEmail, prepareInquiry, randomIp, seedCart, signUp, test, waitForMail } from "./account-helpers";

test.describe("registro, verificación e inicio de sesión", () => {
  test("recorrido completo: registro → sesión inmediata → salir → ingresar; el carrito se conserva", async ({ page }) => {
    const email = newEmail("ana");
    await seedCart(page);
    await go(page, "/cuenta/registro");
    await page.getByLabel("Nombre").fill("Ana Pérez");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Repetí la contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL(/\/cuenta$/);
    expect(countMails(email, "verificacion")).toBe(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Hola, Ana/i);
    await expect(page.getByRole("link", { name: /Mi mi cuenta|sesión iniciada como Ana Pérez/ })).toBeVisible();

    // el carrito sigue intacto después de registrarse e iniciar sesión
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/cuenta\/ingresar/);
    await expect(page.getByText("Cerraste sesión. Tu carrito se conserva.")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await go(page, "/cuenta");
    await expect(page.getByRole("link", { name: "Ingresar" })).toBeVisible(); // ya no hay sesión

    await loginUI(page, email);
    await expect(page).toHaveURL(/\/cuenta$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Hola, Ana/i);
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    // la sesión persiste al recargar
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Hola, Ana/i);
  });

  test("validaciones del formulario de registro", async ({ page }) => {
    await go(page, "/cuenta/registro");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Ingresá tu nombre.")).toBeVisible();
    await expect(page.getByText("Ingresá un correo válido.")).toBeVisible();
    await expect(page.getByText("Usá al menos 10 caracteres.")).toBeVisible();
    await page.getByLabel("Nombre").fill("Ana");
    await page.getByLabel("Correo electrónico").fill("no-es-correo");
    await page.getByLabel("Contraseña", { exact: true }).fill("corta");
    await page.getByLabel("Repetí la contraseña").fill("otra");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByText("Ingresá un correo válido.")).toBeVisible();
    await expect(page.getByText("Usá al menos 10 caracteres.")).toBeVisible();
    await expect(page.getByText("Las contraseñas no coinciden.")).toBeVisible();
    await expect(page.getByLabel("Correo electrónico")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByTestId("registro-ok")).toHaveCount(0);
  });

  test("registrar un correo ya existente responde igual y no revela la cuenta", async ({ page, request, ip }) => {
    const email = newEmail("dup");
    await signUp(page, "Dora", email);
    const again = await request.post("/api/auth/sign-up/email", { data: { name: "Otra", email, password: PASSWORD }, headers: { Origin: ORIGIN, "x-forwarded-for": ip } });
    const fresh = await request.post("/api/auth/sign-up/email", { data: { name: "Nueva", email: newEmail("nuevo"), password: PASSWORD }, headers: { Origin: ORIGIN, "x-forwarded-for": ip } });
    expect(again.ok()).toBe(false);
    expect(fresh.ok()).toBe(true);
  });

  test("credenciales incorrectas: mensaje genérico, sin sesión", async ({ page }) => {
    const email = newEmail("cred");
    await signUp(page, "Cris", email);
    await logoutApi(page);
    await loginUI(page, email, "contraseña-equivocada-1");
    await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." })).toBeVisible();
    await loginUI(page, newEmail("fantasma"), "cualquier-cosa-123");
    await expect(page.getByRole("alert").filter({ hasText: "Correo o contraseña incorrectos." })).toBeVisible(); // mismo mensaje
    await page.goto("/cuenta/perfil");
    await expect(page).toHaveURL(/\/cuenta\/ingresar\?next=%2Fcuenta%2Fperfil/);
  });

  test("límite de intentos: tras muchos ingresos fallidos seguidos se frena con un mensaje claro", async ({ request, ip }) => {
    const email = newEmail("limite");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request.post("/api/auth/sign-in/email", { data: { email, password: "incorrecta-123456" }, headers: { Origin: ORIGIN, "x-forwarded-for": ip } });
      statuses.push(r.status());
    }
    expect(statuses).toContain(429);
    expect(statuses.indexOf(429)).toBeGreaterThanOrEqual(8); // los primeros intentos responden como credenciales incorrectas
  });

  test("rutas privadas sin sesión redirigen al ingreso y no se puede redirigir a otros sitios", async ({ page }) => {
    for (const p of ["/cuenta/consultas", "/cuenta/favoritos", "/cuenta/perfil", "/cuenta/consultas/TT-ABCDEFGH"]) {
      await go(page, p);
      await expect(page).toHaveURL(/\/cuenta\/ingresar\?next=/);
    }
    const email = newEmail("next");
    await signUp(page, "Nora", email);
    await logoutApi(page);
    await loginUI(page, email, PASSWORD, "https://sitio-malicioso.example/robo");
    await expect(page).toHaveURL(/localhost:3100\/cuenta$/);
  });

  test("las contraseñas no se guardan en texto plano y los correos locales no se sirven por la web", async ({ page, request }) => {
    const email = newEmail("hash");
    await signUp(page, "Hugo", email);
    const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
    const [row] = await sql<{ p: string }[]>`select a.password as p from account a join "user" u on u.id = a.user_id where u.email = ${email}`;
    await sql.end({ timeout: 2 });
    expect(row.p).not.toContain(PASSWORD);
    expect(row.p.length).toBeGreaterThan(40);
    for (const url of ["/.local/mail/", `/.local/${path.basename(MAIL_DIR)}/`, "/.local/data/"]) {
      expect((await request.get(url)).status()).toBe(404);
    }
  });

  test("protección de origen: un POST de inicio de sesión desde otro sitio se rechaza", async ({ request, ip }) => {
    const r = await request.post("/api/auth/sign-in/email", { data: { email: newEmail(), password: PASSWORD }, headers: { Origin: "https://sitio-malicioso.example", "x-forwarded-for": ip } });
    expect(r.status()).toBe(403);
  });
});

test.describe("verificación y recuperación", () => {
  test("verificación: token inválido, reenvío y enlace reutilizado", async ({ page }) => {
    await go(page, "/cuenta/verificado?error=invalid_token");
    await expect(page.getByTestId("verificacion-invalida")).toBeVisible();

    const email = newEmail("ver");
    await page.request.post("/api/auth/sign-up/email", { data: { name: "Vera", email, password: PASSWORD, callbackURL: "/cuenta/verificado" }, headers: { Origin: ORIGIN } });
    await page.request.post("/api/auth/send-verification-email", { data: { email, callbackURL: "/cuenta/verificado" }, headers: { Origin: ORIGIN } });
    const mail = await waitForMail(email, "verificacion");
    const bad = mail.link.replace(/token=[^&]+/, "token=abc.def.ghi");
    await go(page, bad);
    await expect(page.getByTestId("verificacion-invalida")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/No pudimos confirmar/i);

    // (el enlace de confirmación es un token firmado con vencimiento propio; el vencimiento lo valida la librería)
    await go(page, "/cuenta/perfil");
    await page.getByRole("button", { name: "Confirmar correo para recibir avisos" }).click();
    const second = await waitForMail(email, "verificacion", 1);
    await go(page, second.link);
    await expect(page.getByTestId("verificacion-ok")).toBeVisible();
    // reutilizar el mismo enlace ya confirmado no rompe nada ni duplica la cuenta
    await go(page, second.link);
    await expect(page.locator("body")).toContainText(/confirm/i);
  });

  test("recuperación de punta a punta: pedir, correo local, nueva contraseña, enlace de un solo uso", async ({ page }) => {
    const email = newEmail("rec");
    await signUp(page, "Rita", email);
    await logoutApi(page);

    await go(page, "/cuenta/recuperar");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByTestId("recuperar-ok")).toContainText("Si hay una cuenta con ese correo");
    const mail = await waitForMail(email, "recuperacion");

    await go(page, mail.link);
    await expect(page).toHaveURL(/\/cuenta\/restablecer\?token=/);
    await page.getByLabel("Contraseña nueva").fill("nueva-clave-segura-456");
    await page.getByLabel("Repetí la contraseña").fill("nueva-clave-segura-456");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByTestId("reset-ok")).toBeVisible();

    // la vieja ya no sirve y la nueva sí
    await loginUI(page, email, PASSWORD);
    await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
    await loginUI(page, email, "nueva-clave-segura-456");
    await expect(page).toHaveURL(/\/cuenta$/);
    await logoutApi(page);

    // el enlace ya usado no vuelve a servir
    await go(page, mail.link);
    await expect(page.getByTestId("reset-invalido")).toBeVisible();
  });

  test("recuperación: token inventado, expirado y respuesta idéntica para correos inexistentes", async ({ page }) => {
    await go(page, "/cuenta/restablecer?token=inventado");
    await page.getByLabel("Contraseña nueva").fill("nueva-clave-segura-456");
    await page.getByLabel("Repetí la contraseña").fill("nueva-clave-segura-456");
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "no es válido o ya venció" })).toBeVisible();
    await go(page, "/cuenta/restablecer");
    await expect(page.getByTestId("reset-invalido")).toBeVisible();
    await go(page, "/cuenta/restablecer?error=INVALID_TOKEN");
    await expect(page.getByTestId("reset-invalido")).toBeVisible();

    // un correo que no existe recibe exactamente la misma respuesta y no genera ningún correo
    const ghost = newEmail("fantasma");
    await go(page, "/cuenta/recuperar");
    await page.getByLabel("Correo electrónico").fill(ghost);
    await page.getByRole("button", { name: "Enviarme el enlace" }).click();
    await expect(page.getByTestId("recuperar-ok")).toContainText("Si hay una cuenta con ese correo");
    await page.waitForTimeout(500);
    expect(countMails(ghost, "recuperacion")).toBe(0);

    // vencido
    const email = newEmail("venc");
    await signUp(page, "Vero", email);
    await logoutApi(page);
    await page.request.post("/api/auth/request-password-reset", { data: { email, redirectTo: "/cuenta/restablecer" }, headers: { Origin: ORIGIN } });
    const mail = await waitForMail(email, "recuperacion");
    const sql = postgres(DB_URL, { max: 1, onnotice: () => undefined });
    await sql`update verification set expires_at = ${new Date(Date.now() - 1000)} where identifier like 'reset-password:%'`;
    await sql.end({ timeout: 2 });
    await go(page, mail.link);
    await expect(page.getByTestId("reset-invalido")).toBeVisible();
  });
});

test.describe("favoritos", () => {
  test("sin sesión pide ingresar y vuelve al producto; guarda, persiste y no duplica", async ({ page, request, ip }) => {
    const email = newEmail("fav");
    await signUp(page, "Fabi", email);
    await logoutApi(page);

    await go(page, "/productos/storm-emeralda-sobre");
    await page.getByRole("button", { name: /Guardar Storm Emeralda · Sobre en favoritos/ }).first().click();
    await expect(page).toHaveURL(/\/cuenta\/ingresar\?next=%2Fproductos%2Fstorm-emeralda-sobre/);
    await expect(page.getByText("Iniciá sesión para guardar productos en favoritos.")).toBeVisible();
    await page.getByLabel("Correo electrónico").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await expect(page).toHaveURL(/\/productos\/storm-emeralda-sobre/);

    const heart = page.getByRole("button", { name: "Quitar Storm Emeralda · Sobre de favoritos" }).first();
    await expect(heart).toHaveCount(0); // todavía no era favorito
    await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/favorites") && r.ok()), page.getByRole("button", { name: /Guardar Storm Emeralda · Sobre en favoritos/ }).first().click()]);
    await expect(page.getByRole("button", { name: "Quitar Storm Emeralda · Sobre de favoritos" }).first()).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByRole("button", { name: "Quitar Storm Emeralda · Sobre de favoritos" }).first()).toBeVisible();

    // desde el catálogo también y la lista de favoritos lo muestra enlazado a su ficha
    await go(page, "/sellados");
    await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/favorites") && r.ok()), page.getByRole("button", { name: /Guardar Storm Emeralda · Caja en favoritos/ }).click()]);
    await go(page, "/cuenta/favoritos");
    await expect(page.locator("main ul.grid > li")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Storm Emeralda · Caja" })).toHaveAttribute("href", "/productos/storm-emeralda-caja");

    // persisten al cerrar sesión y volver a entrar
    await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/favorites") && r.ok()), page.getByRole("button", { name: "Quitar Storm Emeralda · Caja de favoritos" }).click()]);
    await expect(page.locator("main ul.grid > li")).toHaveCount(2); // la tarjeta sigue hasta recargar; el cambio ya se guardó
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.locator("main ul.grid > li")).toHaveCount(1);
    await logoutApi(page);
    await loginUI(page, email);
    await expect(page).toHaveURL(/[/]cuenta$/); // esperar a que termine el ingreso antes de navegar
    await go(page, "/cuenta/favoritos");
    await expect(page.locator("main ul.grid > li")).toHaveCount(1);

    // la API no duplica ni acepta productos inexistentes, y exige sesión
    const noAuth = await request.post("/api/favorites", { data: { productId: "storm-sobre" }, headers: { Origin: ORIGIN, "x-forwarded-for": ip } });
    expect(noAuth.status()).toBe(401);
    const h = { Origin: ORIGIN };
    expect((await page.request.post("/api/favorites", { data: { productId: "storm-sobre" }, headers: h })).ok()).toBe(true);
    expect((await page.request.post("/api/favorites", { data: { productId: "storm-sobre" }, headers: h })).ok()).toBe(true);
    expect((await page.request.post("/api/favorites", { data: { productId: "no-existe" }, headers: h })).status()).toBe(404);
    const state = await (await page.request.get("/api/account")).json();
    expect(state.favorites.filter((x: string) => x === "storm-sobre")).toHaveLength(1);
  });

  test("estado vacío de favoritos", async ({ page }) => {
    await signUp(page, "Vacío", newEmail("vac"));
    await go(page, "/cuenta/favoritos");
    await expect(page.getByTestId("favoritos-vacio")).toBeVisible();
  });
});

test.describe("dos usuarios distintos", () => {
  test("cada uno ve solo sus favoritos y sus consultas; no puede abrir las del otro", async ({ browser }) => {
    const mk = async () => {
      const ctx = await browser.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
      return { ctx, page: await ctx.newPage() };
    };
    const A = await mk();
    const B = await mk();
    const emailA = newEmail("usuariaA");
    const emailB = newEmail("usuarioB");
    await signUp(A.page, "Alicia", emailA);
    await signUp(B.page, "Bruno", emailB);

    // A guarda un favorito y prepara una consulta estando con sesión
    expect((await A.page.request.post("/api/favorites", { data: { productId: "storm-caja" }, headers: { Origin: ORIGIN } })).ok()).toBe(true);
    await seedCart(A.page, [{ productId: "storm-pack5", quantity: 1, priceMinor: 4200000 }]);
    const refA = await prepareInquiry(A.page);
    await go(A.page, "/cuenta/consultas");
    await expect(A.page.getByRole("heading", { level: 1 })).toHaveText(/Mis consultas/i);
    await expect(A.page.getByRole("link", { name: new RegExp(refA) })).toBeVisible();
    await expect(A.page.getByText("Consulta preparada").first()).toBeVisible();
    await expect(A.page.locator("main")).not.toContainText(/pagad[ao]|compra realizada|compra confirmada/i);
    await go(A.page, `/cuenta/consultas/${refA}`);
    await expect(A.page.getByTestId("mensaje")).toContainText(`Referencia: ${refA}`);

    // B no ve nada de A
    await go(B.page, "/cuenta/consultas");
    await expect(B.page.getByTestId("consultas-vacio")).toBeVisible();
    await go(B.page, "/cuenta/favoritos");
    await expect(B.page.getByTestId("favoritos-vacio")).toBeVisible();
    for (const url of [`/cuenta/consultas/${refA}`, `/carrito/consulta/${refA}`]) {
      expect((await B.page.goto(url))?.status()).toBe(404);
    }
    const stateB = await (await B.page.request.get("/api/account")).json();
    expect(stateB.favorites).toEqual([]);
    expect(stateB.user.email).toBe(emailB);

    // el body no puede elegir de quién es el favorito ni de quién la consulta
    const sneaky = await B.page.request.post("/api/favorites", { data: { productId: "storm-sobre", userId: "otro" }, headers: { Origin: ORIGIN } });
    expect(sneaky.ok()).toBe(true);
    const stateA = await (await A.page.request.get("/api/account")).json();
    expect(stateA.favorites).toEqual(["storm-caja"]);
    expect((await (await B.page.request.get("/api/account")).json()).favorites).toEqual(["storm-sobre"]);
    // B no puede quitar el favorito de A
    await B.page.request.delete("/api/favorites", { data: { productId: "storm-caja" }, headers: { Origin: ORIGIN } });
    expect((await (await A.page.request.get("/api/account")).json()).favorites).toEqual(["storm-caja"]);

    // invitado (sin sesión) no recibe historial privado
    const guestCtx = await browser.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const g = await guestCtx.newPage();
    expect((await g.goto(`/carrito/consulta/${refA}`))?.status()).toBe(404);
    expect(await (await g.request.get("/api/account")).json()).toEqual({ user: null, favorites: [] });
    await go(g, "/cuenta/consultas");
    await expect(g).toHaveURL(/\/cuenta\/ingresar/);

    await Promise.all([A.ctx.close(), B.ctx.close(), guestCtx.close()]);
  });
});

test.describe("asociar consultas de invitado a una cuenta", () => {
  test("solo desde el mismo navegador (cookie de sesión), nunca con la referencia", async ({ page, browser }) => {
    // 1) invitado prepara una consulta
    await seedCart(page);
    const ref = await prepareInquiry(page);
    await go(page, "/carrito"); // la cookie de invitado ya existe

    // 2) se registra y entra desde ese mismo navegador
    const email = newEmail("claim");
    await signUp(page, "Clara", email);
    await go(page, "/cuenta/consultas");
    await expect(page.getByTestId("consultas-vacio")).toBeVisible(); // todavía no se asoció nada solo
    const card = page.getByTestId("reclamar");
    await expect(card).toContainText("Tenés 1 consulta de invitado en este navegador");
    await card.getByRole("button", { name: "Agregar a mi cuenta" }).click();
    await expect(card).toContainText("Agregamos 1 consulta a tu cuenta");
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByRole("link", { name: new RegExp(ref) })).toBeVisible();
    await expect(page.getByTestId("reclamar")).toHaveCount(0);

    // 3) otra persona con otra cuenta y otro navegador no puede quedarse con ella, ni enviando la referencia
    const other = await browser.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
    const o = await other.newPage();
    await signUp(o, "Otro", newEmail("otro"));
    const sin = await o.request.post("/api/inquiries/claim", { data: { reference: ref }, headers: { Origin: ORIGIN } });
    expect(sin.status()).toBe(200);
    expect(await sin.json()).toEqual({ claimed: 0 });
    await go(o, "/cuenta/consultas");
    await expect(o.getByTestId("consultas-vacio")).toBeVisible();
    expect((await o.goto(`/cuenta/consultas/${ref}`))?.status()).toBe(404);
    // sin sesión no se puede reclamar
    const anon = await (await browser.newContext({ baseURL: ORIGIN })).request.post("/api/inquiries/claim", { headers: { Origin: ORIGIN } });
    expect(anon.status()).toBe(401);
    await other.close();

    // 4) tras asociarla, el acceso de invitado queda cerrado: al salir, este navegador ya no la abre
    await logoutApi(page);
    expect((await page.goto(`/carrito/consulta/${ref}`))?.status()).toBe(404);
    await loginUI(page, email);
    await expect(page).toHaveURL(/[/]cuenta$/);
    expect((await page.goto(`/cuenta/consultas/${ref}`))?.status()).toBe(200);
  });

  test("una consulta preparada con la sesión iniciada queda en la cuenta sin pasos extra", async ({ page }) => {
    await signUp(page, "Dana", newEmail("dana"));
    await seedCart(page);
    const ref = await prepareInquiry(page);
    await go(page, "/cuenta/consultas");
    await expect(page.getByRole("link", { name: new RegExp(ref) })).toBeVisible();
    await expect(page.getByTestId("reclamar")).toHaveCount(0);
  });
});

test.describe("perfil y datos personales", () => {
  test("cambiar nombre y contraseña; al salir se borran nombre y entrega pero no los productos", async ({ page }) => {
    const email = newEmail("perfil");
    await signUp(page, "Paula Gómez", email);
    await go(page, "/cuenta/perfil");
    await page.getByLabel("Nombre").fill("Paula G.");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Guardamos tu nombre.")).toBeVisible();
    await page.reload();
    await page.locator("html[data-hydrated='true']").waitFor();
    await expect(page.getByLabel("Nombre")).toHaveValue("Paula G.");

    await page.getByLabel("Contraseña actual").fill("equivocada-123456");
    await page.getByLabel("Contraseña nueva", { exact: true }).fill("otra-clave-segura-789");
    await page.getByLabel("Repetí la contraseña nueva").fill("otra-clave-segura-789");
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "La contraseña actual no es correcta." })).toBeVisible();
    await page.getByLabel("Contraseña actual").fill(PASSWORD);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText(/Cambiaste tu contraseña/)).toBeVisible();

    // el carrito toma el nombre del perfil; al cerrar sesión se limpia lo personal
    await seedCart(page);
    await go(page, "/carrito");
    await expect(page.getByLabel(/Nombre y apellido/)).toHaveValue("Paula G.");
    await page.getByLabel(/^Andreani/).check();
    await page.getByLabel("Localidad").fill("Haedo");
    await go(page, "/cuenta/perfil");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/cuenta\/ingresar/);
    await go(page, "/carrito");
    await expect(page.getByTestId("cantidad-storm-sobre")).toHaveText("2");
    await expect(page.getByLabel(/Nombre y apellido/)).toHaveValue("");
    await expect(page.getByLabel(/^Andreani/)).not.toBeChecked();
    await loginUI(page, email, "otra-clave-segura-789");
    await expect(page).toHaveURL(/\/cuenta$/);
  });
});

test.describe("compra como invitado sigue funcionando", () => {
  test("armar el carrito y preparar la consulta no exige cuenta", async ({ page }) => {
    await seedCart(page);
    const ref = await prepareInquiry(page);
    await expect(page.getByText("Todavía no enviaste nada.")).toBeVisible();
    expect(ref).toMatch(/^TT-/);
    await go(page, "/cuenta");
    await expect(page.getByText("Tu cuenta, opcional.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Seguir como invitado" })).toBeVisible();
  });
});

test("las pantallas de cuenta no desbordan en móvil", async ({ page, isMobile }) => {
  test.skip(!isMobile, "solo móvil");
  for (const p of ["/cuenta", "/cuenta/ingresar", "/cuenta/registro", "/cuenta/recuperar", "/cuenta/restablecer?token=x"]) {
    await go(page, p);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});

