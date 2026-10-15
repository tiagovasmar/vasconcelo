import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, runMigrations } from "@/db/client";
import { openTestDb, type TestDb } from "./helpers/pg";
import { inquiries, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addFavorite, FavoriteError, listFavoriteIds, listFavoriteProducts, removeFavorite } from "@/features/account/favorites";
import { claimGuestInquiries, countGuestInquiries, createInquiry, getInquiryFor, hashToken, listInquiriesForUser } from "@/features/inquiries/service";
import { safeNext } from "@/lib/safe-next";
import { sendMail } from "@/server/mail";

let db: TestDb;
const now = new Date();
const addUser = async (id: string) => await db.insert(user).values({ id, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
const body = (n: number, over: Record<string, unknown> = {}) => ({
  items: [{ productId: "storm-sobre", quantity: 1, expectedPriceMinor: 950000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: `clave-cuentas-${String(n).padStart(8, "0")}`, ...over,
});
const guest = (tag: string) => ({ sessionTokenHash: hashToken(tag) });

beforeEach(async () => {
  db = await openTestDb();
  await addUser("ana");
  await addUser("beto");
});

describe("favoritos", () => {
  it("agrega sin duplicar y quita", async () => {
    await addFavorite(db, "ana", "storm-sobre");
    await addFavorite(db, "ana", "storm-sobre");
    await addFavorite(db, "ana", "storm-caja");
    expect(await listFavoriteIds(db, "ana")).toEqual(["storm-sobre", "storm-caja"]);
    await removeFavorite(db, "ana", "storm-sobre");
    await removeFavorite(db, "ana", "storm-sobre"); // quitar dos veces no falla
    expect(await listFavoriteIds(db, "ana")).toEqual(["storm-caja"]);
  });
  it("cada usuario ve solo los suyos", async () => {
    await addFavorite(db, "ana", "storm-sobre");
    await addFavorite(db, "beto", "storm-caja");
    expect(await listFavoriteIds(db, "ana")).toEqual(["storm-sobre"]);
    expect(await listFavoriteIds(db, "beto")).toEqual(["storm-caja"]);
    await removeFavorite(db, "beto", "storm-sobre"); // beto no puede quitar el de ana
    expect(await listFavoriteIds(db, "ana")).toEqual(["storm-sobre"]);
    expect((await listFavoriteProducts(db, "beto")).map((p) => p.id)).toEqual(["storm-caja"]);
  });
  it("solo productos sellados existentes del catálogo", async () => {
    await expect(addFavorite(db, "ana", "no-existe")).rejects.toThrow(FavoriteError);
  });
  it("se borran junto con el usuario y exigen un usuario válido", async () => {
    await addFavorite(db, "ana", "storm-sobre");
    await db.delete(user).where(eq(user.id, "ana"));
    expect(await listFavoriteIds(db, "ana")).toEqual([]);
    await expect(addFavorite(db, "fantasma", "storm-sobre")).rejects.toThrow(); // clave foránea
  });
});

describe("Mis consultas y propiedad", () => {
  it("una consulta hecha con sesión pertenece solo a la cuenta (no al token de invitado)", async () => {
    const ctx = { ...guest("navegador-1"), userId: "ana" };
    const { inquiry } = await createInquiry(db, body(1), ctx);
    expect((await getInquiryFor(db, inquiry.reference, { userId: "ana" }))?.reference).toBe(inquiry.reference);
    expect(await getInquiryFor(db, inquiry.reference, { userId: "beto" })).toBeNull();
    expect(await getInquiryFor(db, inquiry.reference, guest("navegador-1"))).toBeNull();
    expect(await listInquiriesForUser(db, "ana")).toHaveLength(1);
    expect(await listInquiriesForUser(db, "beto")).toEqual([]);
    expect((await listInquiriesForUser(db, "ana"))[0].status).toBe("consulta_preparada");
  });
  it("el historial no presenta consultas como pagadas ni como compras", async () => {
    await createInquiry(db, body(2), { ...guest("n"), userId: "ana" });
    const row = (await db.select().from(inquiries))[0];
    expect(row.status).toBe("consulta_preparada");
    expect(JSON.stringify(await listInquiriesForUser(db, "ana"))).not.toMatch(/pagad|compra|confirmad|enviad/i);
  });
  it("idempotencia con cuenta: el mismo usuario repite y obtiene la misma; otro usuario no", async () => {
    const a = await createInquiry(db, body(3), { ...guest("n"), userId: "ana" });
    const b = await createInquiry(db, body(3), { ...guest("n"), userId: "ana" });
    expect(b.replayed).toBe(true);
    expect(b.inquiry.reference).toBe(a.inquiry.reference);
    await expect(createInquiry(db, body(3), { ...guest("n"), userId: "beto" })).rejects.toThrow();
    await expect(createInquiry(db, body(3), guest("n"))).rejects.toThrow(); // ni como invitado
  });
});

describe("asociar consultas de invitado a una cuenta", () => {
  it("solo con la prueba de pertenencia de la sesión (token), y queda solo para la cuenta", async () => {
    const a = (await createInquiry(db, body(10), guest("navegador-A"))).inquiry;
    const b = (await createInquiry(db, body(11), guest("navegador-A"))).inquiry;
    const other = (await createInquiry(db, body(12), guest("navegador-B"))).inquiry; // de otra persona
    expect(await countGuestInquiries(db, hashToken("navegador-A"))).toBe(2);

    // Ana reclama con el token de SU navegador
    expect(await claimGuestInquiries(db, "ana", hashToken("navegador-A"))).toBe(2);
    expect((await listInquiriesForUser(db, "ana")).map((q) => q.reference).sort()).toEqual([a.reference, b.reference].sort());
    // la de otro navegador no se toca
    expect(await getInquiryFor(db, other.reference, { userId: "ana" })).toBeNull();
    expect((await getInquiryFor(db, other.reference, guest("navegador-B")))?.reference).toBe(other.reference);
    // el token de invitado ya no abre las reclamadas (se rotó): solo la cuenta
    expect(await getInquiryFor(db, a.reference, guest("navegador-A"))).toBeNull();
    expect(await countGuestInquiries(db, hashToken("navegador-A"))).toBe(0);
  });
  it("conocer la referencia no sirve: sin el token no se reclama nada", async () => {
    const a = (await createInquiry(db, body(20), guest("navegador-A"))).inquiry;
    expect(await claimGuestInquiries(db, "beto", hashToken("otro-navegador"))).toBe(0);
    expect(await claimGuestInquiries(db, "beto", hashToken(a.reference))).toBe(0); // la referencia no es un token
    expect(await listInquiriesForUser(db, "beto")).toEqual([]);
    expect(await getInquiryFor(db, a.reference, { userId: "beto" })).toBeNull();
  });
  it("una consulta ya asociada a una cuenta no puede reclamarla otro usuario", async () => {
    await createInquiry(db, body(30), guest("navegador-A"));
    expect(await claimGuestInquiries(db, "ana", hashToken("navegador-A"))).toBe(1);
    expect(await claimGuestInquiries(db, "beto", hashToken("navegador-A"))).toBe(0);
    expect(await listInquiriesForUser(db, "ana")).toHaveLength(1);
    expect(await listInquiriesForUser(db, "beto")).toEqual([]);
  });
  it("reclamar dos veces es inofensivo", async () => {
    await createInquiry(db, body(40), guest("navegador-A"));
    expect(await claimGuestInquiries(db, "ana", hashToken("navegador-A"))).toBe(1);
    expect(await claimGuestInquiries(db, "ana", hashToken("navegador-A"))).toBe(0);
    expect(await listInquiriesForUser(db, "ana")).toHaveLength(1);
  });
});

describe("persistencia tras reiniciar", () => {
  it("usuarios, favoritos y consultas siguen ahí al reconectar y volver a migrar (migraciones repetibles, sin perder datos)", async () => {
    const first = db;
    await first.insert(user).values({ id: "ana2", name: "Ana", email: "ana2@example.com", emailVerified: true, createdAt: now, updatedAt: now });
    await addFavorite(first, "ana2", "storm-sobre");
    const ref = (await createInquiry(first, body(50), { ...guest("n"), userId: "ana2" })).inquiry.reference;
    // «Reinicio»: se corre de nuevo la migración sobre la misma base y se abre otra conexión (como una instancia nueva del servidor).
    await runMigrations(db.testUrl);
    const second = createDb(db.testUrl, { max: 1 });
    try {
      expect(await listFavoriteIds(second, "ana2")).toEqual(["storm-sobre"]);
      expect((await getInquiryFor(second, ref, { userId: "ana2" }))?.reference).toBe(ref);
      expect(await second.select().from(user).where(eq(user.id, "ana2"))).toHaveLength(1);
    } finally {
      await second.$client.end({ timeout: 5 });
    }
  });
});

describe("correo local y redirecciones", () => {
  it("el transporte local guarda el correo como archivo, solo en desarrollo", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-"));
    vi.stubEnv("MAIL_DIR", dir);
    vi.stubEnv("NODE_ENV", "development");
    await sendMail({ to: "ana@example.com", subject: "Hola", text: "x", kind: "verificacion", link: "http://localhost/x?token=abc" });
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, files[0]), "utf8"))).toMatchObject({ to: "ana@example.com", transport: "local-file" });
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("en producción el transporte local está deshabilitado y no simula el envío", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-"));
    vi.stubEnv("MAIL_DIR", dir);
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendMail({ to: "a@b.co", subject: "x", text: "x", kind: "recuperacion", link: "http://x" })).rejects.toThrow(/deshabilitado en producción/);
    expect(fs.readdirSync(dir)).toEqual([]);
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("safeNext solo permite rutas internas", async () => {
    expect(safeNext("/cuenta/favoritos")).toBe("/cuenta/favoritos");
    expect(safeNext("https://malo.example")).toBe("/cuenta");
    expect(safeNext("//malo.example")).toBe("/cuenta");
    expect(safeNext("/\\malo.example")).toBe("/cuenta");
    expect(safeNext("javascript:alert(1)")).toBe("/cuenta");
    expect(safeNext(undefined)).toBe("/cuenta");
    expect(safeNext("/x\r\nSet-Cookie: a=b")).toBe("/cuenta");
  });
});

describe("correo no disponible (producción sin proveedor)", () => {
  const post = (path: string) => new Request(`http://localhost:3000/api/auth${path}`, { method: "POST" });
  it("en producción bloquea registro, recuperación y reenvío con 503 explícito, sin simular envíos", async () => {
    const { guardMail } = await import("@/server/mail-guard");
    vi.stubEnv("NODE_ENV", "production");
    for (const p of ["/sign-up/email", "/request-password-reset", "/send-verification-email"]) {
      const res = guardMail(post(p));
      expect(res?.status).toBe(503);
      expect((await res!.json()).code).toBe("MAIL_UNAVAILABLE");
    }
    expect(guardMail(post("/sign-in/email"))).toBeNull(); // ingresar y salir siguen funcionando
    expect(guardMail(post("/sign-out"))).toBeNull();
    expect(guardMail(new Request("http://localhost:3000/api/auth/get-session"))).toBeNull();
    vi.unstubAllEnvs();
  });
  it("en desarrollo no bloquea nada (hay transporte local)", async () => {
    const { guardMail } = await import("@/server/mail-guard");
    const { mailTransportAvailable } = await import("@/server/mail");
    vi.stubEnv("NODE_ENV", "development");
    expect(mailTransportAvailable()).toBe(true);
    expect(guardMail(post("/sign-up/email"))).toBeNull();
    vi.unstubAllEnvs();
  });
});

describe("transporte local explícito en producción (solo pruebas locales)", () => {
  it("MAIL_TRANSPORT=local lo habilita aun en producción; sin esa variable sigue deshabilitado", async () => {
    const { localMailActive } = await import("@/server/mail");
    vi.stubEnv("NODE_ENV", "production");
    expect(localMailActive()).toBe(false);
    vi.stubEnv("MAIL_TRANSPORT", "local");
    expect(localMailActive()).toBe(true);
    vi.unstubAllEnvs();
  });
});
