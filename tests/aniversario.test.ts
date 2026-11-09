import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { applyOverrides } from "@/features/catalog/overrides";
import { commercialState } from "@/features/catalog/commercial";
import { evaluateCart } from "@/features/inquiries/pricing";
import { priceCart } from "@/features/promos/combo";
import registro from "@/content/colecciones/imagenes-china.json";
import datos from "@/content/colecciones/origen/china/productos.json";

/** Portadas del 30.º aniversario chino (tanda 6) y la ficha nueva de Bulbasaur. */
const all = realCatalog.products;
const get = (id: string) => all.find((p) => p.id === id)!;
const vol2 = get("zh-30-zhounian-ilustraciones-vol2");
const vol3 = get("zh-30-zhounian-ilustraciones-vol3");
const bulba = get("zh-30-zhounian-carta-p-bulbasaur");
const regDe = (id: string, i = 0) => registro.find((r) => r.productId === id && r.index === i)!;

describe("portadas del aniversario (solo las fichas; no el banner ni las cartas destacadas del inicio)", () => {
  it("Vol.2 muestra el envase de Totodile (Principal_04) y Vol.3 el de Torchic (Principal_05), de la publicación 1024232254134", () => {
    expect(regDe(vol2.id).origen).toMatchObject({ fuente: "1024232254134", archivo: "Principal_04.jpg" });
    expect(regDe(vol3.id).origen).toMatchObject({ fuente: "1024232254134", archivo: "Principal_05.png" });
    expect(vol2.images[0].alt).toMatch(/Totodile/);
    expect(vol3.images[0].alt).toMatch(/Torchic/);
    expect(vol2.images[0].origin).toContain("1024232254134");
  });
  it("conservan su identidad (id, sku, slug, variante, contenido, 9 diseños al azar) y su segunda foto", () => {
    expect(vol2).toMatchObject({ sku: "ZH-1059308989628", slug: "zh-30-zhounian-ilustraciones-vol2", variant: "Vol.2" });
    expect(vol3).toMatchObject({ sku: "ZH-1070165751188", slug: "zh-30-zhounian-ilustraciones-vol3", variant: "Vol.3" });
    for (const p of [vol2, vol3]) {
      expect(p.images).toHaveLength(2);
      expect(p.images[1].view).toBe("contents");
      expect(p.description).toMatch(/9 diseños/);
    }
  });
  it("siguen identificadas como fotos de proveedor (referencia), sin permiso de uso afirmado", () => {
    for (const im of [vol2.images[0], vol3.images[0], bulba.images[0]]) {
      expect(im.status).toBe("reference");
      expect(im.source).toBe("supplier");
      expect(im.license).toMatch(/Sin permiso de uso/);
    }
  });
  it("los archivos optimizados existen, son nítidos y livianos (no se sirven los originales)", () => {
    for (const p of [vol2, vol3, bulba]) {
      const f = path.join(process.cwd(), "public", p.images[0].src);
      expect(fs.existsSync(f)).toBe(true);
      expect(fs.statSync(f).size).toBeLessThan(300_000);
      expect(p.images[0].width).toBeGreaterThanOrEqual(500);
      expect(p.images[0].src).not.toMatch(/Downloads|\.jpg$|\.png$/);
    }
  });
  it("el envase de Torchic (PNG con transparencia) no arrastra las barras negras del original", () => {
    expect(regDe(vol3.id).hasAlpha).toBe(true);
    expect(regDe(vol3.id).operacion).toMatch(/transparencia/);
    expect(regDe(vol3.id).width).toBeLessThan(regDe(vol3.id).height); // envase vertical recortado, sin márgenes cuadrados
  });
  it("el banner del inicio y las cartas destacadas no usan estas imágenes", () => {
    const src = ["src/app/page.tsx", "src/content/store.ts", "src/content/inicio.ts"].filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
    expect(src).not.toMatch(/carta-p-bulbasaur|ilustraciones-vol[23]-1/);
  });
});

describe("ficha nueva de Bulbasaur (borrador sin confirmar)", () => {
  it("existe una sola, con colección en inglés verificado, idioma chino simplificado y nombre original", () => {
    expect(all.filter((p) => /bulbasaur/i.test(p.title))).toHaveLength(1);
    expect(bulba).toMatchObject({ language: "zh", region: "CN", expansionIds: ["zh-30-zhounian"], kind: "pack", variant: "Carta P · Bulbasaur" });
    expect(bulba.title).toMatch(/Bulbasaur/);
    expect(bulba.originalTitle).toContain("妙蛙种子");
    expect(realCatalog.expansions.find((e) => e.id === "zh-30-zhounian")!.name).toBe("30th Celebration");
    expect(all.filter((p) => p.sku === bulba.sku || p.slug === bulba.slug)).toHaveLength(1);
  });
  it("es un borrador: no está publicada, no se puede comprar ni consultar, y explica el dato pendiente", () => {
    expect(bulba.active).toBe(false);
    expect(bulba.draftNote).toMatch(/9 tipos y 1 carta al azar/);
    expect(bulba.priceMinor).toBeNull();
    expect(bulba.stockQuantity).toBeNull();
    expect(commercialState(bulba)).toBe("pending");
    const ev = evaluateCart([{ productId: bulba.id, quantity: 1 }], all);
    expect(ev.lines[0].status).toBe("unavailable");
    const encargo = evaluateCart([{ productId: bulba.id, quantity: 1, mode: "encargo" }], all);
    expect(encargo.lines[0].status).toBe("unavailable");
  });
  it("no promete Bulbasaur: el contenido habla de una carta al azar de 9 y no garantiza una carta ni una rareza", () => {
    expect(bulba.description).toMatch(/no se promete Bulbasaur/);
    expect(bulba.description).toMatch(/9 tipos/);
    expect(bulba.contents).toHaveLength(1);
    expect(bulba.contents[0].note).toMatch(/no está confirmado/);
    const g = realCatalog.guarantees.filter((x) => bulba.guaranteeIds.includes(x.id));
    expect(g.every((x) => x.type === "physical_contents" && x.evidence === "seller_pack_contents")).toBe(true);
    expect(realCatalog.pullRates.filter((r) => r.productScope === bulba.id)).toHaveLength(0);
  });
  it("no copia accesorios ni contenidos de los sets Vol.2/Vol.3 (marco acrílico, sobre de 5 cartas)", () => {
    const text = JSON.stringify([bulba.description, bulba.contents]);
    expect(text).not.toMatch(/marco magnético|星彩晶璃|共逐荣光|sobre de 5/i);
  });
  it("una ficha en borrador no cuenta como caja ni activa promociones", () => {
    expect(priceCart([{ productId: bulba.id, kind: bulba.kind, quantity: 3, unitPriceMinor: 100 }], { enabled: true, boxIds: [bulba.id], boosterIds: [] }).combo.slots).toBe(0);
  });
  it("el catálogo público no la lista, pero el panel la puede publicar (con precio y stock cargados por el dueño)", () => {
    const publicas = applyOverrides(all, new Map()).filter((p) => p.active);
    expect(publicas.find((p) => p.id === bulba.id)).toBeUndefined();
    const publicada = applyOverrides(all, new Map([[bulba.id, { productId: bulba.id, priceMinor: null, priceUsdMinor: 1000, priceArsMinor: null, title: null, description: null, orderOnly: false, stockQuantity: 5, maxPerOrder: null, visible: true, updatedAt: 1, updatedByEmail: "d@e.com" }]]), { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "t", warn: false });
    expect(publicada.find((p) => p.id === bulba.id)).toMatchObject({ active: true, priceMinor: 1_230_000 });
  });
  it("su foto de proveedor existe y viene de la publicación 1024232254134 (SKU de Taobao 6053279645670 sin variante seleccionable por Pokémon)", () => {
    expect(regDe(bulba.id).origen).toMatchObject({ fuente: "1024232254134", archivo: "Principal_03.jpg" });
    const fuente = realCatalog.sources.find((s) => s.id === "zh-src-1024232254134")!;
    expect(fuente.url).toContain("1024232254134");
    expect(fuente.publisher).toMatch(/revendedor/);
    const def = (datos.productos as Array<{ id: string; evidencia: string }>).find((p) => p.id === bulba.id)!;
    expect(def.evidencia).toContain("no prueban una variante seleccionable");
  });
});
