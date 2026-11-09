import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { account, favorites, inquiries, session, user } from "@/db/schema";
import { openTestDb, type TestDb } from "./helpers/pg";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ set() {}, get() {}, getAll: () => [] }) }));
vi.setConfig({ testTimeout: 120_000 });

/**
 * Vinculación de cuentas de Google con la lógica REAL de Better Auth sobre PostgreSQL real.
 * LÍMITE: solo se simula la respuesta del endpoint de tokens de Google (fetch interceptado). NO se probó contra Google de verdad: eso requiere las credenciales
 * del dueño y se verifica a mano (ver docs/GOOGLE.md).
 */
const ORIGIN = "http://localhost:3000";
let db: TestDb;
let mailDir: string;
const saved = { ...process.env };
const realFetch = globalThis.fetch;

async function boot(google = true) {
  vi.resetModules();
  (globalThis as Record<string, unknown>).__tiendaDb = undefined;
  (globalThis as Record<string, unknown>).__tiendaAuth = undefined;
  if (google) Object.assign(process.env, { GOOGLE_CLIENT_ID: "cliente-de-prueba.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secreto-de-prueba" });
  else { delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET; }
  const { getAuth } = await import("@/server/auth");
  const admin = await import("@/server/admin");
  const g = await import("@/server/google");
  return { auth: getAuth(), admin, g };
}

beforeEach(async () => {
  db = await openTestDb();
  mailDir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-google-"));
  Object.assign(process.env, { DATABASE_URL: db.testUrl, DATABASE_POOL_MAX: "2", BETTER_AUTH_SECRET: "secreto-de-prueba-0123456789abcdef0123456789abcdef", BETTER_AUTH_URL: ORIGIN, MAIL_DIR: mailDir, ADMIN_EMAIL: "dueno@example.com" });
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  process.env = { ...saved };
  fs.rmSync(mailDir, { recursive: true, force: true });
  const g = globalThis as { __tiendaDb?: { $client: { end: (o?: object) => Promise<void> } } };
  await g.__tiendaDb?.$client.end({ timeout: 2 }).catch(() => undefined);
  g.__tiendaDb = undefined;
});

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (c: Record<string, unknown>) => `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: "https://accounts.google.com", aud: "cliente-de-prueba.apps.googleusercontent.com", iat: 1, exp: 9_999_999_999, ...c })}.firma`;
const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");

/** Recorre el flujo completo: pedir el enlace a Google → «volver» desde Google con un perfil simulado → devolver la respuesta del callback. */
async function loginWithGoogle(auth: { handler: (r: Request) => Promise<Response> }, profile: Record<string, unknown>, ip = "10.1.1.1") {
  const start = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ provider: "google", callbackURL: "/cuenta", errorCallbackURL: "/cuenta/ingresar" }) }));
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  expect(url).toContain("accounts.google.com");
  const state = new URL(url).searchParams.get("state")!;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (u.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", id_token: idToken(profile), token_type: "Bearer", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } });
    return realFetch(input, init);
  }) as typeof fetch;
  return auth.handler(new Request(`${ORIGIN}/api/auth/callback/google?code=codigo&state=${state}`, { headers: { cookie: cookieOf(start), "x-forwarded-for": ip } }));
}
const profile = (email: string, over: Record<string, unknown> = {}) => ({ sub: `google-${email}`, email, email_verified: true, name: "Persona de Prueba", picture: "https://example.com/p.png", ...over });

describe("«Continuar con Google»", () => {
  it("sin credenciales no existe: el botón no se ofrece y la ruta de Google no responde", async () => {
    const { auth, g } = await boot(false);
    expect(g.googleEnabled()).toBe(false);
    const r = await auth.handler(new Request(`${ORIGIN}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ provider: "google", callbackURL: "/cuenta" }) }));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(account)).toHaveLength(0);
  });

  it("crea una cuenta nueva con el correo verificado por Google y abre sesión", async () => {
    const { auth, g } = await boot();
    expect(g.googleEnabled()).toBe(true);
    const res = await loginWithGoogle(auth, profile("nueva@example.com"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/cuenta");
    const [u] = await db.select().from(user).where(eq(user.email, "nueva@example.com"));
    expect(u).toMatchObject({ emailVerified: true, name: "Persona de Prueba" });
    const accs = await db.select().from(account).where(eq(account.userId, u.id));
    expect(accs.map((a) => a.providerId)).toEqual(["google"]);
    expect(accs[0].password).toBeNull(); // no se inventa una contraseña
    const s = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(res) }) });
    expect(s?.user.email).toBe("nueva@example.com");
  });

  it("se vincula a la cuenta existente del mismo correo (verificado): no duplica, conserva favoritos y consultas", async () => {
    const { auth } = await boot();
    const hoy = new Date();
    await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: hoy, updatedAt: hoy });
    await db.insert(account).values({ id: "acc-ana", accountId: "ana", providerId: "credential", userId: "ana", password: "hash-existente", createdAt: hoy, updatedAt: hoy });
    await db.insert(favorites).values({ userId: "ana", productId: "storm-sobre", createdAt: 1 });
    await db.insert(inquiries).values({ id: "TT-ANA00001", idempotencyKey: "k-ana-0000000001", contentHash: "h", sessionTokenHash: "s", userId: "ana", status: "consulta_preparada", currency: "ARS", subtotalMinor: 1, deliveryMethod: "retiro", deliveryJson: "{}", paymentPreference: "efectivo", message: "m", createdAt: 1 });
    const res = await loginWithGoogle(auth, profile("ana@example.com"));
    expect(res.status).toBe(302);
    expect(await db.select().from(user)).toHaveLength(1); // sin duplicar
    const accs = await db.select().from(account).where(eq(account.userId, "ana"));
    expect(accs.map((a) => a.providerId).sort()).toEqual(["credential", "google"]);
    expect(accs.find((a) => a.providerId === "credential")!.password).toBe("hash-existente"); // la contraseña sigue igual
    const s = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(res) }) });
    expect(s?.user.id).toBe("ana");
    expect(await db.select().from(favorites).where(eq(favorites.userId, "ana"))).toHaveLength(1);
    expect(await db.select().from(inquiries).where(eq(inquiries.userId, "ana"))).toHaveLength(1);
  });

  it("NO se apropia de una cuenta registrada pero sin confirmar el correo (anti pre-registro): no vincula ni abre sesión", async () => {
    const { auth } = await boot();
    const hoy = new Date();
    await db.insert(user).values({ id: "victima", name: "Víctima", email: "victima@example.com", emailVerified: false, createdAt: hoy, updatedAt: hoy });
    await db.insert(account).values({ id: "acc-v", accountId: "victima", providerId: "credential", userId: "victima", password: "hash-del-atacante", createdAt: hoy, updatedAt: hoy });
    const res = await loginWithGoogle(auth, profile("victima@example.com"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/error=/);
    expect((await db.select().from(account).where(eq(account.userId, "victima"))).map((a) => a.providerId)).toEqual(["credential"]);
    expect(await db.select().from(session)).toHaveLength(0);
    expect(await db.select().from(user)).toHaveLength(1);
  });

  it("no vincula si Google NO informa el correo como verificado ni si el correo es otro", async () => {
    const { auth } = await boot();
    const hoy = new Date();
    await db.insert(user).values({ id: "ana", name: "Ana", email: "ana@example.com", emailVerified: true, createdAt: hoy, updatedAt: hoy });
    const r = await loginWithGoogle(auth, profile("ana@example.com", { email_verified: false, sub: "otro-sub" }), "10.1.1.2");
    expect(r.headers.get("location")).toMatch(/error=/);
    expect((await db.select().from(account).where(eq(account.userId, "ana")))).toHaveLength(0);
    // Una segunda cuenta de Google con OTRO correo crea otra cuenta, nunca se une a la de Ana.
    await loginWithGoogle(auth, profile("otra@example.com"), "10.1.1.3");
    expect(await db.select().from(user)).toHaveLength(2);
    expect(await db.select().from(account).where(and(eq(account.userId, "ana"), eq(account.providerId, "google")))).toHaveLength(0);
  });
});

describe("permisos: siempre validados en el servidor", () => {
  it("Google vuelve al dominio desde el que se inicia, tanto tienda propia como Netlify; rechaza sitios ajenos", async () => {
    const netlifyHost = "vasconcelo.netlify.app";
    const shopHost = "vasconcelo.shop";
    const shopOrigin = `https://${shopHost}`;
    process.env.BETTER_AUTH_URL = `https://${netlifyHost}`;
    const { auth } = await boot();
    // Better Auth omite por defecto esta defensa en NODE_ENV=test; activar el comportamiento real.
    (await auth.$context).skipOriginCheck = false;
    for (const host of [shopHost, `www.${shopHost}`, netlifyHost]) {
      const origin = `https://${host}`;
      const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, { method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-for": `10.9.1.${host.length}` }, body: JSON.stringify({ provider: "google", callbackURL: "/cuenta" }) }));
      expect(response.status).toBe(200);
      const url = new URL((await response.json()).url);
      expect(url.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/google`);
    }
    const registration = await auth.handler(new Request(`${shopOrigin}/api/auth/sign-up/email`, { method: "POST", headers: { origin: shopOrigin, "content-type": "application/json", "x-forwarded-for": "10.9.3.1" }, body: JSON.stringify({ name: "Cliente Prueba", email: "dominios@example.com", password: "Clave-de-prueba-2026!" }) }));
    expect(registration.status).toBe(200);
    for (const host of [shopHost, netlifyHost]) {
      const response = await auth.handler(new Request(`https://${host}/api/auth/sign-in/email`, { method: "POST", headers: { origin: `https://${host}`, "content-type": "application/json", "x-forwarded-for": `10.9.4.${host.length}` }, body: JSON.stringify({ email: "dominios@example.com", password: "Clave-de-prueba-2026!" }) }));
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie().some((cookie) => cookie.includes("session_token"))).toBe(true);
    }
    const response = await auth.handler(new Request(`${shopOrigin}/api/auth/sign-in/social`, { method: "POST", headers: { origin: "https://ajeno.example", cookie: "prueba=1", "content-type": "application/json", "x-forwarded-for": "10.9.2.99" }, body: JSON.stringify({ provider: "google", callbackURL: "/cuenta" }) }));
    expect(response.status).toBe(403);
  });
  it("el nombre o el correo que manda el navegador no otorgan permisos; el administrador es solo ADMIN_EMAIL con correo verificado", async () => {
    const { auth, admin } = await boot();
    // Una persona de Google con otro correo, aunque se llame «dueno» o «Administrador», no es admin.
    const res = await loginWithGoogle(auth, profile("intruso@example.com", { name: "Administrador dueno@example.com" }));
    const req = new Request(`${ORIGIN}/api/x`, { headers: { cookie: cookieOf(res), "x-admin": "1", "x-user-email": "dueno@example.com" } });
    expect(await admin.adminFromRequest(req)).toMatchObject({ status: 403 });
    // El dueño entra con Google: su correo viene verificado por Google y coincide con ADMIN_EMAIL.
    const own = await loginWithGoogle(auth, profile("dueno@example.com", { sub: "g-dueno" }), "10.1.1.9");
    const ok = await admin.adminFromRequest(new Request(`${ORIGIN}/api/x`, { headers: { cookie: cookieOf(own) } }));
    expect("user" in ok && ok.user.email).toBe("dueno@example.com");
    // Sin sesión, 401.
    expect(await admin.adminFromRequest(new Request(`${ORIGIN}/api/x`))).toMatchObject({ status: 401 });
  });
});
