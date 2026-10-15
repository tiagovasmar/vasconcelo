import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCatalog } from "@/content/catalog";
import { mediaAssets } from "@/db/schema";
import { libraryImages, resetGallery, saveGallery } from "@/features/catalog/gallery";
import { loadGalleries, parseGallery } from "@/features/catalog/overrides";
import { MediaError, readUpload, storeUpload, uploadExists } from "@/server/media";
import { getStore, LocalStore, StorageError, SupabaseStore, storageAvailable, supabaseStorageConfig } from "@/server/storage";
import { openTestDb, type TestDb } from "./helpers/pg";

/**
 * Supabase Storage: estas pruebas ejercitan el código REAL de `SupabaseStore` (peticiones HTTP, cabeceras, manejo de duplicados, paginación) contra un
 * SERVIDOR DE PRUEBA LOCAL que imita el contrato de la API REST de Storage. Es una simulación del servicio, NO Supabase: la prueba contra un bucket real
 * (subir, listar, descargar, rechazo de escritura pública) se hace con `npm run storage:probar` y queda registrada como pendiente hasta ejecutarla.
 */
const KEY = "sb_secret_clave-de-prueba";
const objects = new Map<string, Buffer>();
const seen: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders }> = [];
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const url = new URL(req.url!, "http://x");
      seen.push({ method: req.method!, url: url.pathname, headers: req.headers });
      const json = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      const m = url.pathname.match(/^\/storage\/v1\/object\/(public\/)?([^/]+)\/(.+)$/);
      const list = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
      const isWrite = req.method === "POST";
      if ((isWrite || list) && req.headers.apikey !== KEY) return json(401, { statusCode: "401", error: "Unauthorized", message: "Invalid API key" });
      if (list) {
        const { offset = 0, limit = 100 } = JSON.parse(Buffer.concat(chunks).toString() || "{}") as { offset?: number; limit?: number };
        const names = [...objects.keys()].sort().slice(offset, offset + limit).map((name) => ({ name, id: `id-${name}` }));
        return json(200, names);
      }
      if (!m) return json(404, { statusCode: "404", error: "not_found" });
      const name = decodeURIComponent(m[3]);
      if (req.method === "POST") {
        if (objects.has(name)) return json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        objects.set(name, Buffer.concat(chunks));
        return json(200, { Key: `${m[2]}/${name}` });
      }
      if ((req.method === "GET" || req.method === "HEAD") && m[1]) {
        const o = objects.get(name);
        if (!o) return json(400, { statusCode: "404", error: "not_found", message: "Object not found" }); // Supabase responde 400/404 según la versión
        res.writeHead(200, { "Content-Type": "image/webp", "Content-Length": o.length });
        return res.end(req.method === "HEAD" ? undefined : o);
      }
      json(405, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const savedEnv = { ...process.env };
beforeEach(() => {
  objects.clear();
  seen.length = 0;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SECRET_KEY = KEY;
  process.env.SUPABASE_STORAGE_BUCKET = "product-images";
  process.env.STORAGE_DRIVER = ""; // vuelve a elegir según la configuración (en las pruebas generales vale «local»)
});
afterEach(() => { process.env = { ...savedEnv }; });

const png = (w = 800, h = 600, c = 90) => sharp({ create: { width: w, height: h, channels: 3, background: { r: c, g: 120, b: 80 } } }).png().toBuffer();

describe("SupabaseStore (contra un servidor de prueba que imita la API)", () => {
  it("elige Supabase cuando hay URL y clave, y disco local solo si no es producción o se pide", () => {
    expect(getStore()).toBeInstanceOf(SupabaseStore);
    delete process.env.SUPABASE_SECRET_KEY;
    expect(supabaseStorageConfig()).toBeNull();
    expect(getStore()).toBeInstanceOf(LocalStore); // fuera de producción
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getStore()).toThrow(StorageError); // en producción NUNCA cae a disco
    expect(storageAvailable()).toBe(false);
    vi.unstubAllEnvs();
  });

  it("sube con la clave en la cabecera, no duplica, lista, descarga y detecta existencia", async () => {
    const s = new SupabaseStore(supabaseStorageConfig()!);
    const data = Buffer.from("contenido-1");
    expect(await s.put("a.webp", data, "image/webp")).toEqual({ created: true });
    expect(await s.put("a.webp", data, "image/webp")).toEqual({ created: false }); // duplicado = ya estaba
    expect((await s.get("a.webp"))!.equals(data)).toBe(true);
    expect(await s.get("no-esta.webp")).toBeNull();
    expect(await s.exists("a.webp")).toBe(true);
    expect(await s.exists("b.webp")).toBe(false);
    expect(await s.list()).toEqual(["a.webp"]);
    const post = seen.find((r) => r.method === "POST" && r.url.endsWith("/a.webp"))!;
    expect(post.headers.apikey).toBe(KEY);
    expect(post.headers.authorization).toBeUndefined(); // las claves sb_secret_ no son JWT: no van como Bearer
    expect(post.headers["x-upsert"]).toBe("false");
    // Las lecturas públicas no mandan la clave.
    expect(seen.find((r) => r.method === "GET")!.headers.apikey).toBeUndefined();
  });

  it("con una clave clásica (JWT service_role) también la manda como Bearer", async () => {
    const jwt = "eyJhbGciOi.service.role";
    process.env.SUPABASE_SECRET_KEY = jwt;
    const server2 = http.createServer((req, res) => { seen.push({ method: req.method!, url: req.url!, headers: req.headers }); res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); });
    await new Promise<void>((r) => server2.listen(0, "127.0.0.1", r));
    const s = new SupabaseStore({ url: `http://127.0.0.1:${(server2.address() as AddressInfo).port}`, key: jwt, bucket: "b" });
    await s.put("x.webp", Buffer.from("x"), "image/webp");
    expect(seen.at(-1)!.headers.authorization).toBe(`Bearer ${jwt}`);
    expect(seen.at(-1)!.headers.apikey).toBe(jwt);
    await new Promise<void>((r) => server2.close(() => r()));
  });

  it("una clave equivocada (o sin permiso) es rechazada y el error no filtra datos", async () => {
    const s = new SupabaseStore({ url: base, key: "sb_secret_otra", bucket: "product-images" });
    await expect(s.put("a.webp", Buffer.from("x"), "image/webp")).rejects.toThrow(/HTTP 401/);
    await expect(s.list()).rejects.toThrow(StorageError);
    expect(objects.size).toBe(0);
  });

  it("lista más de 1000 objetos paginando", async () => {
    for (let i = 0; i < 1203; i++) objects.set(`f${String(i).padStart(5, "0")}.webp`, Buffer.from("x"));
    const names = await new SupabaseStore(supabaseStorageConfig()!).list();
    expect(names).toHaveLength(1203);
    expect(new Set(names).size).toBe(1203);
  });
});

describe("subida de fotos del panel con Supabase Storage", () => {
  let db: TestDb;
  const actor = { id: "u1", email: "dueno@example.com" };
  beforeEach(async () => { db = await openTestDb(); });

  it("optimiza a WebP, genera la miniatura, guarda ambos en Storage y registra la foto; la misma foto no se duplica", async () => {
    const r = await storeUpload(db, { data: await png(), originalName: "../../x.png", uploadedByEmail: actor.email });
    expect(r.id).toMatch(/^[a-f0-9]{24}\.webp$/);
    expect(r.src).toBe(`/images/uploads/${r.id}`);
    expect([...objects.keys()].sort()).toEqual([r.id, r.id.replace(".webp", "-t.webp")].sort());
    expect((await sharp(objects.get(r.id)).metadata()).format).toBe("webp");
    expect(Math.max(...Object.values(await sharp(objects.get(r.id.replace(".webp", "-t.webp"))).metadata()).filter((v): v is number => typeof v === "number" && v < 1000).slice(0, 2))).toBeLessThanOrEqual(400);
    expect((await readUpload(r.id))!.equals(objects.get(r.id)!)).toBe(true);
    expect(await uploadExists(r.src)).toBe(true);
    expect(await readUpload("../../etc/passwd")).toBeNull(); // solo nombres generados por el servidor
    const again = await storeUpload(db, { data: await png(), uploadedByEmail: actor.email });
    expect(again.duplicate).toBe(true);
    expect(await db.select().from(mediaAssets)).toHaveLength(1);
    expect(objects.size).toBe(2);
  });

  it("rechaza lo que no es una imagen, lo muy chico y lo vacío sin escribir nada en Storage", async () => {
    for (const [data, code] of [[Buffer.from("texto"), "unsupported_type"], [await png(100, 100), "too_small"], [Buffer.alloc(0), "empty_file"]] as const) {
      await expect(storeUpload(db, { data, uploadedByEmail: actor.email })).rejects.toMatchObject({ code });
    }
    expect(objects.size).toBe(0);
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
    void MediaError;
  });

  it("si Storage rechaza la subida, no queda registro en la base", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_mala";
    await expect(storeUpload(db, { data: await png(), uploadedByEmail: actor.email })).rejects.toThrow(StorageError);
    expect(await db.select().from(mediaAssets)).toHaveLength(0);
  });

  it("flujo completo: subir, ver en la biblioteca, guardar la galería con la foto como portada, recuperarla y volver al catálogo", async () => {
    const p = demoCatalog.products.find((x) => x.images.length > 0)!;
    const up = await storeUpload(db, { data: await png(900, 700, 40), uploadedByEmail: actor.email });
    expect((await libraryImages(db, demoCatalog.products)).some((i) => i.src === up.src)).toBe(true);
    const { version } = await saveGallery(db, demoCatalog.products, p.id, { items: [{ src: up.src, alt: "Foto propia de la caja", source: "store", view: "front" }, { src: p.images[0].src, alt: "Foto del catálogo" }], expectedVersion: 0 }, actor, 5_000);
    const saved = parseGallery((await loadGalleries(db)).get(p.id))!;
    expect(saved.map((i) => i.src)).toEqual([up.src, p.images[0].src]); // la subida es la portada (primera)
    expect(saved[0]).toMatchObject({ status: "final", source: "store", width: up.width, height: up.height });
    expect((await readUpload(up.id))!.length).toBe(up.bytes);
    await expect(saveGallery(db, demoCatalog.products, p.id, { items: [{ src: "/images/uploads/ffffffffffffffffffffffff.webp", alt: "No existe" }], expectedVersion: version }, actor)).rejects.toMatchObject({ code: "unknown_image" });
    await resetGallery(db, demoCatalog.products, p.id, version, actor, 6_000);
    expect(parseGallery((await loadGalleries(db)).get(p.id))).toBeNull();
    expect(objects.has(up.id)).toBe(true); // la foto sigue en Storage (podría reusarse)
  });
});
