import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mediaAssets } from "@/db/schema";
import { openTestDb, type TestDb } from "./helpers/pg";

/** Autorización de las rutas que escriben (subir fotos, editar producto) y entrega de las fotos subidas, con una base real y el almacén local de pruebas. */
let current: { id: string; name: string; email: string; emailVerified: boolean } | null = null;
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: () => { throw new Error("redirect"); } }));
vi.mock("@/server/session", () => ({ getUser: async () => current, userFromRequest: async () => current }));

let db: TestDb;
let dir: string;
const saved = { ...process.env };
beforeEach(async () => {
  db = await openTestDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rutas-"));
  Object.assign(process.env, { DATABASE_URL: db.testUrl, ADMIN_EMAIL: "dueno@example.com", STORAGE_DRIVER: "local", UPLOADS_DIR: dir });
  (globalThis as Record<string, unknown>).__tiendaDb = undefined;
  current = null;
});
afterEach(async () => {
  const g = globalThis as { __tiendaDb?: { $client: { end: (o?: object) => Promise<void> } } };
  await g.__tiendaDb?.$client.end({ timeout: 2 }).catch(() => undefined);
  g.__tiendaDb = undefined;
  process.env = { ...saved };
  fs.rmSync(dir, { recursive: true, force: true });
});

const upload = async (headers: Record<string, string> = {}) => {
  const { POST } = await import("@/app/api/admin/media/route");
  const img = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 4, g: 90, b: 60 } } }).png().toBuffer();
  const form = new FormData();
  form.set("file", new File([new Uint8Array(img)], "foto.png", { type: "image/png" }));
  return POST(new Request("http://localhost:3000/api/admin/media", { method: "POST", body: form, headers: { host: "localhost:3000", ...headers } }));
};

it("los tramos del desplegable solo se leen con sesión del dueño, incluidos los borradores", async () => {
  const { GET } = await import("@/app/api/admin/mayorista/route");
  const request = () => new Request("http://localhost:3000/api/admin/mayorista?productId=storm-sobre");
  expect((await GET(request())).status).toBe(401);
  current = { id: "cliente", name: "Cliente", email: "cliente@example.com", emailVerified: true };
  expect((await GET(request())).status).toBe(403);
  current = { id: "dueno", name: "Dueño", email: "dueno@example.com", emailVerified: true };
  const { saveTier } = await import("@/features/mayorista/precios");
  await saveTier(db, { productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 500 }, { id: current.id, email: current.email });
  const response = await GET(request());
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await response.json()).tiers).toEqual([{ minQty: 10, unitPriceUsdMinor: 500, state: "borrador" }]);
});

describe("subir fotos exige ser el administrador", () => {
  it("sin sesión: 401 y no se guarda nada", async () => {
    const res = await upload();
    expect(res.status).toBe(401);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
  });
  it("con sesión de una persona que no es el dueño: 403", async () => {
    current = { id: "u2", name: "Cliente", email: "cliente@example.com", emailVerified: true };
    expect((await upload()).status).toBe(403);
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
  });
  it("el correo del dueño pero sin confirmar: 403", async () => {
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: false };
    expect((await upload()).status).toBe(403);
  });
  it("sin ADMIN_EMAIL configurado el panel está cerrado para todos", async () => {
    process.env.ADMIN_EMAIL = "";
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    expect((await upload()).status).toBe(403);
  });
  it("origen distinto del sitio: 403 aunque sea el dueño", async () => {
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    expect((await upload({ origin: "https://sitio-malicioso.example" })).status).toBe(403);
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
  });
  it("el dueño sube la foto: se guarda en el almacén, se registra y se entrega por la ruta pública con caché larga", async () => {
    current = { id: "u1", name: "Dueño", email: "dueno@example.com", emailVerified: true };
    const res = await upload({ origin: "http://localhost:3000" });
    expect(res.status).toBe(200);
    const { image } = (await res.json()) as { image: { id: string; src: string } };
    expect(await db.select().from(mediaAssets)).toHaveLength(1);
    const { GET } = await import("@/app/images/uploads/[name]/route");
    const ok = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ name: image.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toContain("immutable");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    const thumb = await GET(new Request("http://localhost/x"), { params: Promise.resolve({ name: image.id.replace(".webp", "-t.webp") }) });
    expect(thumb.status).toBe(200);
    for (const bad of ["../../etc/passwd", "nada.webp", "ffffffffffffffffffffffff.webp", "A".repeat(24) + ".webp"]) {
      expect((await GET(new Request("http://localhost/x"), { params: Promise.resolve({ name: bad }) })).status, bad).toBe(404);
    }
  });
});

describe("editar productos y fotos exige ser el administrador", () => {
  it("PATCH de un producto sin sesión: 401; con otra cuenta: 403", async () => {
    const { PATCH } = await import("@/app/api/admin/products/[id]/route");
    const req = () => new Request("http://localhost:3000/api/admin/products/storm-sobre", { method: "PATCH", headers: { "content-type": "application/json", host: "localhost:3000" }, body: JSON.stringify({ stock: 3, expectedVersion: 0 }) });
    expect((await PATCH(req(), { params: Promise.resolve({ id: "storm-sobre" }) })).status).toBe(401);
    current = { id: "u2", name: "Cliente", email: "cliente@example.com", emailVerified: true };
    expect((await PATCH(req(), { params: Promise.resolve({ id: "storm-sobre" }) })).status).toBe(403);
  });
});
