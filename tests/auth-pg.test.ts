import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, session, user, verification } from "@/db/schema";
import { guardMail } from "@/server/mail-guard";
import { mailConfig, mailTransportAvailable, sendMail, sendViaProvider } from "@/server/mail";
import { openTestDb, type TestDb } from "./helpers/pg";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ set() {}, get() {}, getAll: () => [] }) }));

// Cada prueba recarga Better Auth desde cero y calcula hashes scrypt: con toda la suite en paralelo puede tardar más que el tope general.
vi.setConfig({ testTimeout: 120_000 });

const ORIGIN = "http://localhost:3000";
let db: TestDb;
let mailDir: string;
const saved = { ...process.env };

/** Better Auth real, funcionando sobre PostgreSQL real (adaptador `pg`), cargado de cero para cada prueba. */
async function boot() {
  vi.resetModules();
  (globalThis as Record<string, unknown>).__tiendaDb = undefined;
  (globalThis as Record<string, unknown>).__tiendaAuth = undefined;
  const { getAuth } = await import("@/server/auth");
  const { adminFromRequest, isAdmin } = await import("@/server/admin");
  return { auth: getAuth(), adminFromRequest, isAdmin };
}

beforeEach(async () => {
  db = await openTestDb();
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-auth-"));
  Object.assign(process.env, { DATABASE_URL: db.testUrl, DATABASE_POOL_MAX: "2", BETTER_AUTH_SECRET: "secreto-de-prueba-0123456789abcdef0123456789abcdef", BETTER_AUTH_URL: ORIGIN, MAIL_DIR: mailDir, ADMIN_EMAIL: "dueno@example.com" });
});
afterEach(async () => {
  process.env = { ...saved };
  fs.rmSync(mailDir, { recursive: true, force: true });
  const g = globalThis as { __tiendaDb?: { $client: { end: (o?: object) => Promise<void> } } };
  await g.__tiendaDb?.$client.end({ timeout: 2 }).catch(() => undefined);
  g.__tiendaDb = undefined;
});

const post = (p: string, body: unknown, cookie = "", ip = "10.0.0.1") =>
  new Request(`${ORIGIN}/api/auth${p}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
const lastMail = () => {
  const files = fs.readdirSync(mailDir).sort();
  return JSON.parse(fs.readFileSync(path.join(mailDir, files.at(-1)!), "utf8")) as { to: string; kind: string; link: string };
};

describe("cuentas con Better Auth sobre PostgreSQL", () => {
  it("registro → correo de confirmación → no ingresa sin confirmar → confirma → ingresa → sesión válida → cierra sesión", async () => {
    const { auth } = await boot();
    const reg = await auth.handler(post("/sign-up/email", { name: "Ana", email: "ana@example.com", password: "una-clave-larga-123" }));
    expect(reg.status).toBe(200);
    const [u] = await db.select().from(user).where(eq(user.email, "ana@example.com"));
    expect(u.emailVerified).toBe(false);
    const [acc] = await db.select().from(account).where(eq(account.userId, u.id));
    expect(acc.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // hash scrypt, nunca texto plano
    expect(acc.password).not.toContain("una-clave-larga-123");
    const mail = lastMail();
    expect(mail).toMatchObject({ to: "ana@example.com", kind: "verificacion" });

    const before = await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "una-clave-larga-123" }));
    expect(before.status).toBe(403); // correo sin confirmar

    const verify = await auth.handler(new Request(mail.link, { headers: { "x-forwarded-for": "10.0.0.1" } }));
    expect([200, 302]).toContain(verify.status);
    expect((await db.select().from(user).where(eq(user.id, u.id)))[0].emailVerified).toBe(true);
    expect(await db.select().from(session)).toHaveLength(1); // al confirmar el correo se abre sesión sola (autoSignInAfterVerification)

    const login = await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "una-clave-larga-123" }));
    expect(login.status).toBe(200);
    const cookie = cookieOf(login);
    expect(cookie).toMatch(/better-auth\.session_token=/);
    expect(await db.select().from(session)).toHaveLength(2);
    const get = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }));
    expect((await get.json() as { user: { email: string } }).user.email).toBe("ana@example.com");

    const out = await auth.handler(post("/sign-out", {}, cookie));
    expect(out.status).toBe(200);
    expect(await db.select().from(session)).toHaveLength(1); // la sesión que cerró se borra de la base
    const after = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }));
    expect(await after.json()).toBeNull();
  });

  it("contraseña incorrecta o usuario inexistente: rechazados sin revelar cuál de los dos", async () => {
    const { auth } = await boot();
    await db.insert(user).values({ id: "u1", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    await db.insert(account).values({ id: "a1", accountId: "u1", providerId: "credential", userId: "u1", password: await hashPassword("la-clave-correcta"), createdAt: new Date(), updatedAt: new Date() });
    const bad = await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "equivocada-123456" }));
    const none = await auth.handler(post("/sign-in/email", { email: "nadie@example.com", password: "equivocada-123456" }));
    expect(bad.status).toBe(401);
    expect(none.status).toBe(401);
    expect(((await bad.json()) as { message: string }).message).toBe(((await none.json()) as { message: string }).message);
  });

  it("el límite de intentos se guarda en PostgreSQL: el 9.º ingreso en un minuto da 429", async () => {
    const { auth } = await boot();
    let last = 0;
    for (let i = 0; i < 9; i++) last = (await auth.handler(post("/sign-in/email", { email: "x@example.com", password: "equivocada-123456" }, "", "10.9.9.9"))).status;
    expect(last).toBe(429);
    const { rateLimit } = await import("@/db/schema");
    expect((await db.select().from(rateLimit)).length).toBeGreaterThan(0);
  });

  it("administrador: la cuenta con el correo de ADMIN_EMAIL (confirmada, creada como lo hace npm run admin:crear) ingresa y el servidor la reconoce; otra cuenta confirmada no", async () => {
    const { auth, adminFromRequest, isAdmin } = await boot();
    const now = new Date();
    for (const [id, email] of [["adm", "dueno@example.com"], ["cli", "cliente@example.com"]]) {
      await db.insert(user).values({ id, name: id, email, emailVerified: true, createdAt: now, updatedAt: now });
      await db.insert(account).values({ id: `acc-${id}`, accountId: id, providerId: "credential", userId: id, password: await hashPassword("clave-de-prueba-1234"), createdAt: now, updatedAt: now });
    }
    const loginAdmin = await auth.handler(post("/sign-in/email", { email: "dueno@example.com", password: "clave-de-prueba-1234" }));
    expect(loginAdmin.status).toBe(200);
    const adminCookie = cookieOf(loginAdmin);
    const ok = await adminFromRequest(new Request(`${ORIGIN}/api/admin/x`, { headers: { cookie: adminCookie } }));
    expect("user" in ok && isAdmin(ok.user)).toBe(true);

    const loginCli = await auth.handler(post("/sign-in/email", { email: "cliente@example.com", password: "clave-de-prueba-1234" }, "", "10.0.0.2"));
    const no = await adminFromRequest(new Request(`${ORIGIN}/api/admin/x`, { headers: { cookie: cookieOf(loginCli) } }));
    expect(no).toMatchObject({ status: 403 });
    const anon = await adminFromRequest(new Request(`${ORIGIN}/api/admin/x`));
    expect(anon).toMatchObject({ status: 401 });

    // Cerrar sesión deja de reconocer al administrador.
    await auth.handler(post("/sign-out", {}, adminCookie));
    expect(await adminFromRequest(new Request(`${ORIGIN}/api/admin/x`, { headers: { cookie: adminCookie } }))).toMatchObject({ status: 401 });
  });

  it("un correo de administrador SIN confirmar nunca es administrador (aunque sea el de ADMIN_EMAIL)", async () => {
    const { isAdmin } = await boot();
    expect(isAdmin({ id: "x", name: "x", email: "dueno@example.com", emailVerified: false })).toBe(false);
    expect(isAdmin({ id: "x", name: "x", email: "DUENO@example.com", emailVerified: true })).toBe(true);
    process.env.ADMIN_EMAIL = "";
    expect(isAdmin({ id: "x", name: "x", email: "dueno@example.com", emailVerified: true })).toBe(false); // sin configurar: cerrado
  });

  it("recuperar acceso: pide el enlace, cambia la contraseña y revoca las sesiones anteriores", async () => {
    const { auth } = await boot();
    const now = new Date();
    await db.insert(user).values({ id: "u1", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(account).values({ id: "a1", accountId: "u1", providerId: "credential", userId: "u1", password: await hashPassword("clave-vieja-12345"), createdAt: now, updatedAt: now });
    const login = await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "clave-vieja-12345" }));
    const oldCookie = cookieOf(login);
    expect((await auth.handler(post("/request-password-reset", { email: "ana@example.com", redirectTo: `${ORIGIN}/cuenta/restablecer` }, "", "10.0.0.5"))).status).toBe(200);
    const mail = lastMail();
    expect(mail.kind).toBe("recuperacion");
    const token = new URL(mail.link).pathname.split("/").pop()!;
    const reset = await auth.handler(post("/reset-password", { newPassword: "clave-nueva-67890", token }, "", "10.0.0.5"));
    expect(reset.status).toBe(200);
    expect((await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "clave-vieja-12345" }, "", "10.0.0.6"))).status).toBe(401);
    expect((await auth.handler(post("/sign-in/email", { email: "ana@example.com", password: "clave-nueva-67890" }, "", "10.0.0.7"))).status).toBe(200);
    const stale = await auth.handler(new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie: oldCookie } }));
    expect(await stale.json()).toBeNull();
    expect((await db.select().from(verification)).length).toBe(0); // el token es de un solo uso
  });
});

describe("correo transaccional", () => {
  it("sin proveedor en producción: no hay correo, el registro público queda deshabilitado (503) y no se simula ningún envío", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.MAIL_TRANSPORT;
    delete process.env.MAIL_PROVIDER;
    expect(mailTransportAvailable()).toBe(false);
    await expect(sendMail({ to: "a@b.c", subject: "s", text: "t", kind: "verificacion", link: "https://x" })).rejects.toThrow(/no configurado/);
    const res = guardMail(new Request(`${ORIGIN}/api/auth/sign-up/email`, { method: "POST" }));
    expect(res?.status).toBe(503);
    expect(guardMail(new Request(`${ORIGIN}/api/auth/sign-in/email`, { method: "POST" }))).toBeNull(); // el ingreso (administrador) sigue disponible
    vi.unstubAllEnvs();
  });

  it("con proveedor configurado: envía por su API HTTP con el formato correcto (Resend y Brevo) y falla de forma explícita si lo rechaza", async () => {
    vi.stubEnv("NODE_ENV", "production");
    Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "re_clave_de_prueba", MAIL_FROM: "Vasconcelo <tienda@ejemplo.com>" });
    expect(mailConfig()).toMatchObject({ provider: "resend", fromName: "Vasconcelo", fromEmail: "tienda@ejemplo.com" });
    expect(mailTransportAvailable()).toBe(true);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const okFetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const mail = { to: "ana@example.com", subject: "Confirmá tu correo", text: "Hola https://x/enlace", kind: "verificacion" as const, link: "https://x/enlace" };
    await sendViaProvider(mailConfig()!, mail, okFetch);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_clave_de_prueba");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ from: "Vasconcelo <tienda@ejemplo.com>", to: ["ana@example.com"], subject: "Confirmá tu correo", text: "Hola https://x/enlace" });

    Object.assign(process.env, { MAIL_PROVIDER: "brevo", MAIL_FROM: "tienda@ejemplo.com" });
    await sendViaProvider(mailConfig()!, mail, okFetch);
    expect(calls[1].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect((calls[1].init.headers as Record<string, string>)["api-key"]).toBe("re_clave_de_prueba");
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({ sender: { email: "tienda@ejemplo.com" }, to: [{ email: "ana@example.com" }], textContent: "Hola https://x/enlace" });

    const failing = (async () => new Response("{\"message\":\"domain not verified\"}", { status: 403 })) as unknown as typeof fetch;
    await expect(sendViaProvider(mailConfig()!, mail, failing)).rejects.toThrow(/HTTP 403/);
    await expect(sendViaProvider(mailConfig()!, mail, failing)).rejects.not.toThrow(/domain not verified/); // no se vuelca la respuesta del proveedor
    vi.unstubAllEnvs();
  });

  it("configuración incompleta o remitente inválido: se considera NO configurado", () => {
    expect(mailConfig()).toBeNull();
    Object.assign(process.env, { MAIL_PROVIDER: "resend", MAIL_API_KEY: "k", MAIL_FROM: "no-es-un-correo" });
    expect(mailConfig()).toBeNull();
    Object.assign(process.env, { MAIL_PROVIDER: "otro", MAIL_FROM: "a@b.co" });
    expect(mailConfig()).toBeNull();
  });
});
