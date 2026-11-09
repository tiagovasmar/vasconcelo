import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import datos from "@/content/colecciones/origen/japon-cajas.json";
import cajasProveedor from "@/content/colecciones/imagenes-cajas-proveedor.json";
import registro from "@/content/colecciones/imagenes-japon-cajas.json";
import cajasCenter from "@/content/colecciones/imagenes-cajas-center.json";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { adminProducts, applyOverrides, loadOverrides, saveProductChange } from "@/features/catalog/overrides";
import { commercialState, isInStock, isPurchasable } from "@/features/catalog/commercial";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import { validateCatalog } from "@/features/catalog/validate";
import type { EffectiveRate } from "@/features/fx/convert";

const lote = JSON.parse(fs.readFileSync("src/content/real/precios-venta-usd.json", "utf8")) as { items: Array<{ id: string; usd: number }> };
const NUEVAS: Record<string, { usd: number; sku: string; sobres: number; cartas: number }> = {
  "terastal-festival-ex-caja": { usd: 120, sku: "SV8A-JP-BOX", sobres: 10, cartas: 10 },
  "ninja-spinner-caja": { usd: 115, sku: "M4-JP-BOX", sobres: 30, cartas: 5 },
  "nihil-zero-caja": { usd: 136, sku: "M3-JP-BOX", sobres: 30, cartas: 5 },
  "glory-of-team-rocket-caja": { usd: 195, sku: "SV10-JP-BOX", sobres: 30, cartas: 5 },
  "mega-symphonia-caja": { usd: 130, sku: "M1S-JP-BOX", sobres: 30, cartas: 5 },
  "pokemon-card-151-caja": { usd: 317, sku: "SV2A-JP-BOX", sobres: 20, cartas: 7 },
};
const base = realCatalog.products.filter((product) => (product.game ?? "pokemon") === "pokemon");
const rate = (r: number): EffectiveRate => ({ status: "manual", mode: "manual", rate10k: Math.round(r * 10_000), asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false });
const actor = { id: "u", email: "carga@example.com" };
let db: Db;
beforeEach(async () => { db = await openTestDb(); });
/** Misma regla que scripts/cargar-precios-venta.ts: solo completa precios que faltan. */
const cargar = async () => {
  for (const it of lote.items) {
    const o = (await loadOverrides(db)).get(it.id);
    if (!o || o.priceUsdMinor === null) await saveProductChange(db, base, it.id, { priceUsdMinor: it.usd * 100, expectedVersion: o?.updatedAt ?? 0 }, actor);
  }
};
const vista = async (fx = rate(1400)) => applyOverrides(base, await loadOverrides(db), fx);

describe("seis cajas japonesas nuevas (14/10/2026)", () => {
  const nuevas = base.filter((p) => p.id in NUEVAS);

  it("hay una ficha de CAJA por colección, japonesa, con ids, SKU y slugs estables y sin sobres individuales", async () => {
    expect(nuevas).toHaveLength(6);
    for (const p of nuevas) {
      const n = NUEVAS[p.id];
      expect(p, p.id).toMatchObject({ sku: n.sku, slug: p.id, kind: "box", language: "ja", region: "JP", active: true, isDemo: false, priceMinor: null, stockQuantity: null });
      expect(p.retired).toBeUndefined();
      expect(p.expansionIds).toHaveLength(1);
      expect(p.contents.map((c) => c.quantity)).toEqual([n.sobres, n.cartas, n.sobres * n.cartas]);
    }
    const exps = realCatalog.expansions.filter((e) => nuevas.some((p) => p.expansionIds[0] === e.id));
    expect(exps).toHaveLength(6);
    for (const e of exps) {
      expect(e).toMatchObject({ language: "ja", region: "JP" });
      if (e.id === "glory-of-team-rocket") expect(e).toMatchObject({ cardListStatus: "unavailable", cards: [] });
      else {
        expect(e.cards.length, e.id).toBeGreaterThan(0);
        expect(e.cardListStatus).not.toBe("unavailable");
      }
      expect(base.filter((p) => p.expansionIds.includes(e.id)).map((p) => p.kind), e.id).toEqual(["box"]); // ni sobre individual ni sobres de 20 cartas
    }
    expect(base.filter((p) => p.kind === "booster" && p.language === "ja")).toHaveLength(8);
    expect(validateCatalog(realCatalog, (src) => fs.existsSync(path.join(process.cwd(), "public", src))).filter((i) => i.level === "error")).toEqual([]);
  });

  it("las cinco galerías usan la edición japonesa correcta y todas sus imágenes existen", async () => {
    const codes: Record<string, string> = { "terastal-festival-ex": "SV8a", "ninja-spinner": "M4", "nihil-zero": "M3", "mega-symphonia": "M1S", "pokemon-card-151": "SV2a" };
    for (const [id, code] of Object.entries(codes)) {
      const json = JSON.parse(fs.readFileSync(`src/content/colecciones/cartas/${id}.json`, "utf8"));
      const e = realCatalog.expansions.find((x) => x.id === id)!;
      expect(e.cards).toHaveLength(json.officialCount);
      expect(json.cards.every((c: { setMark: string }) => c.setMark?.toLowerCase() === code.toLowerCase()), id).toBe(true);
      for (const card of e.cards) expect(fs.existsSync(path.join(process.cwd(), "public", card.image.src)), card.id).toBe(true);
      expect(realCatalog.sources.some((s) => s.id === `cartas-${id}`)).toBe(true);
    }
    const china = realCatalog.expansions.find((e) => e.id === "zh-taijing-shengju")!;
    expect(china.language).toBe("zh");
    expect(china.cards).toEqual([]);
  });

  it("no se copian cartas, tasas ni rarezas garantizadas de otra edición", async () => {
    for (const p of nuevas) {
      const gs = realCatalog.guarantees.filter((g) => g.scope === p.id);
      expect(gs.some((g) => g.type === "rarity"), p.id).toBe(false);
      expect(realCatalog.pullRates.some((r) => r.expansionId === p.expansionIds[0]), p.id).toBe(false);
      expect(p.rarityReview?.status).toBe("not_documented");
      expect(p.rarityReview!.sourceIds.every((s) => realCatalog.sources.some((x) => x.id === s))).toBe(true);
    }
    // solo dos sobres declaran una composición en el propio envase: Terastal Festival ex (1 ex) y 151 (2 brillantes)
    const comp = realCatalog.guarantees.filter((g) => g.type === "composition" && g.scope in NUEVAS).map((g) => g.scope).sort();
    expect(comp).toEqual(["pokemon-card-151-caja", "terastal-festival-ex-caja"]);
  });

  it("las fotos tienen huella y origen oficial, con caja cerrada primero y exhibición abierta identificada", async () => {
    for (const p of nuevas) {
      for (const img of p.images.filter((i) => i.source !== "supplier")) {
        const reg = [...registro, ...cajasCenter].find((r) => r.src === img.src)!;
        const buf = fs.readFileSync(path.join(process.cwd(), "public", img.src));
        expect(crypto.createHash("sha256").update(buf).digest("hex"), img.src).toBe(reg.sha256);
        expect(img).toMatchObject({ status: "reference", source: "manufacturer" });
        expect(img.origin).toMatch(/^https:\/\/www\.pokemon(?:-card|center-online)\.com\//);
      }
      if (p.id === "pokemon-card-151-caja") {
        // única caja sin foto oficial: la portada es la foto real de un proveedor (captura del dueño), claramente rotulada, y luego el sobre oficial
        expect(p.images.map((i) => [i.view, i.source])).toEqual([["closed", "supplier"], ["front", "manufacturer"]]);
        expect(p.images[0].alt).toMatch(/foto de un proveedor: referencia, no es el estado del artículo que se vende/);
        const prov = cajasProveedor[0];
        expect(prov.collectionId).toBe("pokemon-card-151");
        expect(crypto.createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), "public", p.images[0].src))).digest("hex")).toBe(prov.sha256);
        expect(crypto.createHash("sha256").update(fs.readFileSync(prov.original)).digest("hex")).toBe(prov.originalSha256); // el original se conserva
        expect(p.description).toMatch(/Todavía no hay una foto oficial de la caja/);
      } else {
        expect(p.images.map((i) => i.view)).toEqual(["closed", "display-open", "front"]);
        const limpia = ["ninja-spinner-caja", "nihil-zero-caja", "mega-symphonia-caja", "glory-of-team-rocket-caja"].includes(p.id);
        if (limpia) {
          // fondo blanco exterior quitado y encuadre ajustado: transparente, apaisada, del tamaño de las otras cajas, y el original (1500×1500) se conserva
          const reg = cajasCenter.find((r) => r.collectionId === p.expansionIds[0] && r.view === "closed")! as typeof cajasCenter[number] & { derivadoDe?: string; derivadoDeSha256?: string };
          expect(p.images[0].opaque).toBe(false);
          expect(p.images[0].width / p.images[0].height).toBeGreaterThan(1.5);
          expect(p.images[0].width).toBeGreaterThanOrEqual(1050);
          expect(p.images[0].width).toBeLessThanOrEqual(1250);
          expect(crypto.createHash("sha256").update(fs.readFileSync(reg.derivadoDe!)).digest("hex")).toBe(reg.derivadoDeSha256);
        } else expect(p.images[0].width).toBe(1500);
        expect(p.images[1].alt).toContain("no es el estado del artículo que se vende");
        expect(p.description).not.toContain("foto de la caja cerrada todavía está pendiente");
      }
    }
  });

  it("los seis importes se mapean a la ficha correcta, se convierten y se redondean a $100", async () => {
    await cargar();
    const v = await vista(rate(1400));
    for (const [id, n] of Object.entries(NUEVAS)) {
      const p = v.find((x) => x.id === id)!;
      expect(p.priceUsdMinor, id).toBe(n.usd * 100);
      expect(p.priceMinor, id).toBe(n.usd * 1400 * 100);
    }
    expect((await vista(rate(1234))).find((p) => p.id === "pokemon-card-151-caja")!.priceMinor).toBe(39_120_000); // 317 × 1.234 = 391.178 → $391.200
    expect(lote.items.filter((i) => i.id in NUEVAS)).toHaveLength(6);
  });

  it("carga repetida sin cambios, sin pisar al dueño y con los 21 precios anteriores intactos", async () => {
    await cargar();
    const snapshot = async () => JSON.stringify((await vista()).filter((p) => p.priceUsdMinor !== null).map((p) => [p.id, p.priceUsdMinor]));
    const antes = await snapshot();
    const n = (await loadOverrides(db)).size;
    expect(n).toBe(27);
    await cargar();
    expect((await loadOverrides(db)).size).toBe(n);
    expect(await snapshot()).toBe(antes);
    const previos = lote.items.filter((i) => !(i.id in NUEVAS));
    expect(previos).toHaveLength(21);
    for (const it of previos) expect((await vista()).find((p) => p.id === it.id)!.priceUsdMinor, it.id).toBe(it.usd * 100);
    // un cambio manual del dueño no se pisa
    const o = (await loadOverrides(db)).get("ninja-spinner-caja")!;
    await saveProductChange(db, base, "ninja-spinner-caja", { priceUsdMinor: 11_000, expectedVersion: o.updatedAt }, actor);
    await cargar();
    expect((await loadOverrides(db)).get("ninja-spinner-caja")!.priceUsdMinor).toBe(11_000);
  });

  it("no tienen stock: no figuran En stock ni se compran; el stock real sí las incluye; los retirados siguen fuera", async () => {
    await cargar();
    const v = await vista();
    for (const id of Object.keys(NUEVAS)) {
      const p = v.find((x) => x.id === id)!;
      expect(p.stockQuantity, id).toBe(0); // stock inicial 0
      expect(isInStock(p), id).toBe(false);
      expect(isPurchasable(p), id).toBe(false);
      expect(commercialState(p), id).toBe("soldout"); // «Sin stock»; el precio ya está cargado
    }
    const q = parseQuery({ disp: "stock" });
    expect(filterProducts(v, realCatalog.expansions, q)).toEqual([]);
    const o = (await loadOverrides(db)).get("mega-symphonia-caja")!;
    await saveProductChange(db, base, "mega-symphonia-caja", { stock: 2, expectedVersion: o.updatedAt }, actor);
    expect(filterProducts(await vista(), realCatalog.expansions, q).map((p) => p.id)).toEqual(["mega-symphonia-caja"]);
    expect(filterProducts(await vista(), realCatalog.expansions, parseQuery({})).some((p) => p.retired)).toBe(false);
  });

  it("se encuentran por nombre, código, nombre japonés y alias, y por formato/idioma/colección", async () => {
    const f = (q: Record<string, string>) => filterProducts(base, realCatalog.expansions, parseQuery(q)).map((p) => p.id);
    expect(f({ q: "terastal festival" })).toEqual(["terastal-festival-ex-caja"]);
    expect(f({ q: "Terastal Fest ex" })).toContain("terastal-festival-ex-caja");
    expect(f({ q: "SV8a" })).toContain("terastal-festival-ex-caja");
    expect(f({ q: "ninja spinner" })).toEqual(["ninja-spinner-caja"]);
    expect(f({ q: "M3" })).toContain("nihil-zero-caja");
    expect(f({ q: "ムニキスゼロ" })).toEqual(["nihil-zero-caja"]);
    expect(f({ q: "team rocket" })).toEqual(["glory-of-team-rocket-caja"]);
    expect(f({ q: "ロケット団の栄光" })).toEqual(["glory-of-team-rocket-caja"]);
    expect(f({ q: "m1s" })).toContain("mega-symphonia-caja");
    expect(f({ q: "151" })).toContain("pokemon-card-151-caja");
    expect(f({ q: "sv2a" })).toEqual(["pokemon-card-151-caja"]);
    expect(f({ expansion: "ninja-spinner" })).toEqual(["ninja-spinner-caja"]);
    expect(f({ formato: "caja", idioma: "ja" })).toHaveLength(14);
    expect(datos.cajas).toHaveLength(6);
  });

  it("aparecen en el panel y se pueden editar", async () => {
    await cargar();
    const ap = await adminProducts(db, base, rate(1400));
    for (const id of Object.keys(NUEVAS)) expect(ap.find((a) => a.product.id === id), id).toBeDefined();
    const r = await saveProductChange(db, base, "nihil-zero-caja", { stock: 4, maxPerOrder: 2, expectedVersion: (await loadOverrides(db)).get("nihil-zero-caja")!.updatedAt }, actor);
    expect(r.changed.sort()).toEqual(["max_per_order", "stock_quantity"]);
  });
});
