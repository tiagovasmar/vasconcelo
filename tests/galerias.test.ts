import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { ImageAssetSchema } from "@/content/schema";
import { storePhotosFor, type StorePhotos } from "@/content/real/store-photos";
import storePhotos from "@/content/real/store-photos.json";
import loteOriginal from "@/content/colecciones/origen/colecciones.json";

const sha = (src: string) => crypto.createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), "public", src))).digest("hex");

describe("galerías de producto: fuentes separadas y sin relleno", () => {
  // Solo el lote japonés (fotos del fabricante); las fotos de proveedor de las fichas chinas se prueban en tests/china.test.ts.
  const productos = realCatalog.products.filter((p) => p.language === "ja" && loteOriginal.collections.some((e) => p.expansionIds.includes(e.id))); // las seis cajas nuevas tienen fotos de sobre y se prueban en japon-cajas.test.ts

  it("todas las imágenes de referencia declaran fuente «fabricante» y qué vista muestran, y cumplen el esquema", () => {
    for (const p of productos) {
      for (const i of p.images) {
        expect(ImageAssetSchema.safeParse(i).success, `${p.id} ${i.src}`).toBe(true);
        if (i.source === "store") continue;
        expect(i.source, p.id).toBe("manufacturer");
        expect(i.view, `${p.id} ${i.src}`).toBeDefined();
        expect(i.status).toBe("reference");
        expect(i.origin).toMatch(/^https:\/\/www\.(30th\.)?pokemon(center-online|-card)\.com\//);
      }
    }
  });

  it("la caja abierta de exhibición está identificada como tal (vista y texto) y la cerrada va primero", () => {
    for (const p of productos.filter((x) => x.kind === "box")) {
      expect(p.images[0].view, p.id).toBe("closed");
      const abierta = p.images.filter((i) => i.view === "display-open");
      expect(abierta, p.id).toHaveLength(1);
      expect(abierta[0].alt).toMatch(/abierta: presentación de exhibición del fabricante \(no es el estado del artículo que se vende\)/);
    }
    for (const p of productos.filter((x) => x.kind === "booster")) expect(p.images.map((i) => i.view), p.id).toEqual(["front"]);
  });

  it("no hay duplicados ni imágenes de otras ediciones: huellas distintas dentro de cada producto y entre colecciones", () => {
    const porHuella = new Map<string, string>();
    for (const p of productos) {
      const propias = new Set<string>();
      for (const i of p.images) {
        expect(i.src.includes(`/${p.expansionIds[0]}/`), `${p.id}: ${i.src} no es de su colección`).toBe(true);
        const h = sha(i.src);
        expect(propias.has(h), `${p.id}: imagen repetida dentro del producto (${i.src})`).toBe(false);
        propias.add(h);
        const otro = porHuella.get(h);
        expect(otro, `${i.src} repite el contenido de ${otro}`).toBeUndefined();
        porHuella.set(h, i.src);
      }
    }
  });

  it("no hay fotos de la tienda inventadas: el archivo está vacío hasta que el dueño aporte las suyas", () => {
    expect(Object.keys((storePhotos as StorePhotos).photos)).toEqual([]);
    for (const p of productos) expect(p.images.some((i) => i.source === "store"), p.id).toBe(false);
  });

  it("las fotos de la tienda, cuando existan, se agregan aparte, con fuente «store» y registro de origen propio", () => {
    const data: StorePhotos = { photos: { "M6-JP-BOX": [
      { file: "/images/tienda/M6-JP-BOX/frente.webp", width: 1600, height: 1200, view: "front", alt: "Frente de la caja de Storm Emeralda del stock de la tienda", takenAt: "2026-11-02" },
      { file: "/images/tienda/M6-JP-BOX/dorso.webp", width: 1600, height: 1200, view: "back", alt: "Dorso de la caja de Storm Emeralda del stock de la tienda", takenAt: "2026-11-02" },
    ] } };
    const fotos = storePhotosFor("M6-JP-BOX", data);
    expect(fotos).toHaveLength(2);
    for (const f of fotos) {
      expect(ImageAssetSchema.safeParse(f).success).toBe(true);
      expect(f).toMatchObject({ source: "store", status: "final" });
      expect(f.origin).toContain("2026-11-02");
    }
    expect(fotos.map((f) => f.view)).toEqual(["front", "back"]);
    expect(storePhotosFor("OTRO-SKU", data)).toEqual([]);
  });
});
