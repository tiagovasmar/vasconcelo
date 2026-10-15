import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { mediaAssets } from "@/db/schema";
import { demoCatalog } from "@/content/catalog";
import { AdminError, applyOverrides, listAudit, loadGalleries, loadOverrides } from "@/features/catalog/overrides";
import { GalleryEditSchema, libraryImages, resetGallery, saveGallery } from "@/features/catalog/gallery";
import { MediaError, readUpload, sniffFormat, storeUpload, uploadExists } from "@/server/media";

const actor = { id: "u1", email: "dueno@example.com" };
const products = demoCatalog.products;
let dir: string;
let db: Db;
const png = (w: number, h: number, alpha = false) => sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 10, g: 120, b: 80, alpha: 0.5 } : { r: 10, g: 120, b: 80 } } }).png().toBuffer();
const jpeg = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().toBuffer();
const up = async (data: Buffer, name = "foto.png") => await storeUpload(db, { data, originalName: name, uploadedByEmail: actor.email });
const fails = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof MediaError) return e; throw e; } throw new Error("se esperaba un MediaError"); };

beforeAll(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-test-")); process.env.UPLOADS_DIR = dir; });
afterAll(async () => { delete process.env.UPLOADS_DIR; fs.rmSync(dir, { recursive: true, force: true }); });
beforeEach(async () => { db = await openTestDb(); });

describe("subida de fotos: validación y optimización", () => {
  it("acepta PNG, JPEG y WebP; guarda WebP optimizado con nombre generado por el servidor y una miniatura", async () => {
    for (const buf of [await png(800, 600), await jpeg(900, 700), await sharp(await png(500, 500)).webp().toBuffer()]) {
      const r = await up(buf, "../../etc/passwd.png");
      expect(r.id).toMatch(/^[a-f0-9]{24}\.webp$/); // el nombre original nunca se usa como ruta
      expect(r.src).toBe(`/images/uploads/${r.id}`);
      expect(fs.existsSync(path.join(dir, r.id))).toBe(true);
      expect(fs.existsSync(path.join(dir, r.id.replace(".webp", "-t.webp")))).toBe(true);
      expect(sniffFormat(fs.readFileSync(path.join(dir, r.id)))).toBe("webp");
      expect(await uploadExists(r.src)).toBe(true);
    }
    expect((await db.select().from(mediaAssets))).toHaveLength(3);
  });

  it("achica lo grande (máx. 1600 px) y la miniatura es mucho más liviana que el original", async () => {
    const big = await jpeg(4000, 3000);
    const r = await up(big);
    expect(Math.max(r.width, r.height)).toBe(1600);
    const thumb = await sharp(fs.readFileSync(path.join(dir, r.id.replace(".webp", "-t.webp")))).metadata();
    expect(Math.max(thumb.width!, thumb.height!)).toBe(400);
    expect(fs.statSync(path.join(dir, r.id.replace(".webp", "-t.webp"))).size).toBeLessThan(fs.statSync(path.join(dir, r.id)).size);
  });

  it("conserva la transparencia de un PNG", async () => {
    const r = await up(await png(600, 600, true));
    expect(r.hasAlpha).toBe(true);
    expect((await sharp(fs.readFileSync(path.join(dir, r.id))).metadata()).hasAlpha).toBe(true);
  });

  it("la misma foto dos veces no duplica el archivo", async () => {
    const buf = await png(700, 700);
    const a = await up(buf);
    const b = await up(buf);
    expect(b.id).toBe(a.id);
    expect(b.duplicate).toBe(true);
    expect((await db.select().from(mediaAssets))).toHaveLength(1);
  });

  it("rechaza lo que no es una imagen real, aunque tenga extensión de imagen", async () => {
    expect((await fails(up(Buffer.from("esto es texto"), "foto.png"))).code).toBe("unsupported_type");
    expect((await fails(up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.svg"))).code).toBe("unsupported_type");
    expect((await fails(up(Buffer.from("<?php system($_GET['x']); ?>"), "shell.php.png"))).code).toBe("unsupported_type");
    expect((await fails(up(Buffer.from("GIF89a" + "x".repeat(300)), "x.gif"))).code).toBe("unsupported_type");
    expect((await fails(up(Buffer.alloc(0)))).code).toBe("empty_file");
  });

  it("rechaza archivos dañados o con firma válida pero contenido roto", async () => {
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("no es un png de verdad".repeat(10))]);
    expect((await fails(up(broken))).code).toBe("corrupt_image");
    const truncated = (await jpeg(900, 900)).subarray(0, 300);
    expect((await fails(up(truncated))).code).toBe("corrupt_image");
  });

  it("rechaza tamaño y dimensiones fuera de rango", async () => {
    expect((await fails(up(await png(120, 800)))).code).toBe("too_small");
    expect((await fails(up(await png(12_500, 320)))).code).toBe("too_large_dimensions");
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024)]);
    expect((await fails(up(huge))).code).toBe("too_large");
  });

  it("un archivo con carga extra anexada no la conserva: se re-codifica", async () => {
    const poly = Buffer.concat([await jpeg(600, 600), Buffer.from("<?php echo 'pwned'; ?>")]);
    const r = await up(poly);
    expect(fs.readFileSync(path.join(dir, r.id)).includes("<?php")).toBe(false);
  });

  it("solo se leen nombres generados por el servidor (sin rutas ni extensiones raras)", async () => {
    const r = await up(await png(500, 500));
    expect(await readUpload(r.id)).not.toBeNull();
    for (const bad of ["../secreto.webp", "..%2f..%2fetc", r.id.replace(".webp", ".php"), "abc.webp", `${r.id}/..`, "", "a".repeat(24) + ".png"]) expect(await readUpload(bad)).toBeNull();
    expect(await uploadExists("/images/uploads/../x.webp")).toBe(false);
  });
});

describe("galería elegida desde el panel", () => {
  const p = products[0];
  const code = p.images.map((i) => ({ src: i.src, alt: i.alt }));

  it("sin galería del panel rige la del código", async () => {
    expect(applyOverrides(products, await loadOverrides(db), null, await loadGalleries(db))[0].images).toEqual(p.images);
  });

  it("guarda orden, portada y texto alternativo; no toca la galería del código ni otros datos", async () => {
    const extra = await up(await png(800, 800));
    const r = await saveGallery(db, products, p.id, { items: [{ src: extra.src, alt: "Mi foto del stock real", source: "store" }, ...code.map((c) => ({ ...c, alt: c.alt + " (ajustado)" }))], expectedVersion: 0 }, actor, 1_000);
    expect(r.version).toBe(1_000);
    const shown = applyOverrides(products, await loadOverrides(db), null, await loadGalleries(db))[0];
    expect(shown.images[0]).toMatchObject({ src: extra.src, alt: "Mi foto del stock real", source: "store", status: "final", width: extra.width, height: extra.height });
    expect(shown.images[0].origin).toMatch(/dueno@example.com/);
    expect(shown.images.slice(1).map((i) => i.alt)).toEqual(code.map((c) => c.alt + " (ajustado)"));
    expect(products[0].images).toEqual(p.images); // el catálogo base no se muta
    expect(shown.title).toBe(p.title);
    expect((await listAudit(db, { productId: p.id }))[0]).toMatchObject({ field: "gallery", userEmail: "dueno@example.com" });
  });

  it("una foto subida como referencia de proveedor queda como referencia, no como final", async () => {
    const extra = await up(await png(650, 650));
    await saveGallery(db, products, p.id, { items: [{ src: extra.src, alt: "Referencia de un proveedor", source: "supplier" }], expectedVersion: 0 }, actor, 1_000);
    expect(applyOverrides(products, await loadOverrides(db), null, await loadGalleries(db))[0].images[0]).toMatchObject({ source: "supplier", status: "reference" });
  });

  it("se puede retirar una foto pero siempre queda al menos una", async () => {
    const two = products.find((x) => x.images.length >= 2);
    if (two) {
      await saveGallery(db, products, two.id, { items: [{ src: two.images[1].src, alt: "Solo esta foto queda" }], expectedVersion: 0 }, actor, 1_000);
      expect(applyOverrides(products, await loadOverrides(db), null, await loadGalleries(db)).find((x) => x.id === two.id)!.images).toHaveLength(1);
    }
    expect(GalleryEditSchema.safeParse({ items: [], expectedVersion: 0 }).success).toBe(false);
    expect(GalleryEditSchema.safeParse({ items: Array.from({ length: 13 }, (_, i) => ({ src: `/images/x${i}.webp`, alt: "texto alt" })), expectedVersion: 0 }).success).toBe(false);
    expect(GalleryEditSchema.safeParse({ items: [{ src: "/images/a.webp", alt: "ab" }], expectedVersion: 0 }).success).toBe(false);
  });

  it("rechaza rutas desconocidas, de otro sitio o con recorrido de directorios, y fotos repetidas", async () => {
    for (const src of ["/images/inventada.webp", "https://evil.example/x.png", "/etc/passwd", "/images/../../.env", "/images/uploads/../../x.webp", "/images/uploads/" + "a".repeat(24) + ".webp"]) {
      await expect(saveGallery(db, products, p.id, { items: [{ src, alt: "texto alternativo" }], expectedVersion: 0 }, actor)).rejects.toThrow(AdminError);
    }
    await expect(saveGallery(db, products, p.id, { items: [{ ...code[0] }, { ...code[0] }], expectedVersion: 0 }, actor)).rejects.toThrow(/repetida/);
    expect((await loadGalleries(db)).size).toBe(0);
  });

  it("detecta ediciones simultáneas y no escribe si no hubo cambios", async () => {
    await saveGallery(db, products, p.id, { items: code.map((c) => ({ ...c, alt: "Primera edición" })), expectedVersion: 0 }, actor, 1_000);
    await expect(saveGallery(db, products, p.id, { items: code.map((c) => ({ ...c, alt: "Segunda edición" })), expectedVersion: 0 }, actor, 2_000)).rejects.toThrow(/modificaron/);
    const same = await saveGallery(db, products, p.id, { items: code.map((c) => ({ ...c, alt: "Primera edición" })), expectedVersion: 1_000 }, actor, 3_000);
    expect(same.version).toBe(1_000);
    expect((await listAudit(db, { productId: p.id })).filter((l) => l.field === "gallery")).toHaveLength(1);
  });

  it("volver a la galería del código", async () => {
    const a = await saveGallery(db, products, p.id, { items: code.map((c) => ({ ...c, alt: "Cambiada por el dueño" })), expectedVersion: 0 }, actor, 1_000);
    await expect(resetGallery(db, products, p.id, 0, actor)).rejects.toThrow(AdminError);
    await resetGallery(db, products, p.id, a.version, actor, 2_000);
    expect(applyOverrides(products, await loadOverrides(db), null, await loadGalleries(db))[0].images).toEqual(p.images);
    expect((await listAudit(db, { productId: p.id }))[0].field).toBe("gallery_reset");
  });

  it("la biblioteca reúne las fotos del catálogo y las subidas, sin repetir", async () => {
    const extra = await up(await png(500, 500));
    const lib = await libraryImages(db, products);
    expect(lib.some((l) => l.src === extra.src)).toBe(true);
    expect(new Set(lib.map((l) => l.src)).size).toBe(lib.length);
    expect(lib.length).toBeGreaterThan(1);
  });
});
