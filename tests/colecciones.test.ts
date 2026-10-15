import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { realCatalog } from "@/content/catalog";
import { demoCatalog } from "@/content/fixtures/demo";
import imagenes from "@/content/colecciones/imagenes.json";
import recortes from "@/content/colecciones/imagenes-recortes.json";
import arteInicio from "@/content/colecciones/imagenes-inicio.json";
import imagenesCartas from "@/content/colecciones/imagenes-cartas.json";
import origen from "@/content/colecciones/origen/colecciones.json";
import nextConfig from "../next.config";
import { commercialState, isPurchasable, priceLabel } from "@/features/catalog/commercial";
import { parseCommercialCsv, parsePriceToMinor } from "@/features/catalog/commercial-import";
import { coverageOf, formatRanges } from "@/features/catalog/coverage";
import { groupGuarantees, ratesForProduct } from "@/features/catalog/pull-rates";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import { rarityFromIcon } from "@/features/catalog/rarity";
import { validateCatalog } from "@/features/catalog/validate";
import { evaluateCart, maxFor } from "@/features/inquiries/pricing";
import { createInquiry, hashToken, InquiryError } from "@/features/inquiries/service";
import { openTestDb } from "./helpers/pg";

// Estas pruebas miran el catálogo REAL japonés (los 16 productos de las 8 colecciones), nunca el catálogo de prueba. Las ediciones chinas
// (36 fichas importadas de proveedores) se prueban aparte, en tests/china.test.ts.
const { sources } = realCatalog;
// Las seis cajas japonesas agregadas el 14/10/2026 (sin lista de cartas) se prueban aparte, en tests/japon-cajas.test.ts.
const pub = (p: string) => path.join(process.cwd(), "public", p.replace(/^\//, ""));
const idsDeExpansion = ["black-bolt", "white-flare", "heat-wave-arena", "inferno-x", "mega-dream-ex", "30th-celebration", "storm-emeralda", "abyss-eye"];
const products = realCatalog.products.filter((p) => p.language === "ja" && p.expansionIds.every((id) => idsDeExpansion.includes(id)));
const expansions = realCatalog.expansions.filter((e) => e.language === "ja" && idsDeExpansion.includes(e.id));
const guarantees = realCatalog.guarantees.filter((g) => g.language === "ja" && products.some((p) => p.id === g.scope));

describe("colecciones y fichas (catálogo real)", () => {
  it("tiene las ocho expansiones japonesas, sin duplicar Storm Emeralda ni mezclar con el catálogo de prueba", async () => {
    expect(expansions.map((e) => e.id).sort()).toEqual([...idsDeExpansion].sort());
    expect(expansions.every((e) => e.language === "ja" && e.region === "JP" && !e.isDemo)).toBe(true);
    expect(expansions.filter((e) => /storm/i.test(e.name))).toHaveLength(1);
    expect(expansions.find((e) => e.id === "storm-emeralda")?.slug).toBe("storm-emeralda"); // la URL existente se conserva
    expect(products.every((p) => !p.isDemo)).toBe(true);
    const demoIds = new Set([...demoCatalog.products.map((p) => p.id), ...demoCatalog.expansions.map((e) => e.id)]);
    expect([...products.map((p) => p.id), ...expansions.map((e) => e.id)].filter((id) => demoIds.has(id) && !["storm-caja", "storm-sobre", "storm-emeralda"].includes(id))).toEqual([]);
  });

  it("cada colección tiene exactamente una caja y un sobre individual, sin packs ni Deluxe", async () => {
    expect(products).toHaveLength(16);
    for (const id of idsDeExpansion) {
      const ps = products.filter((p) => p.expansionIds.join() === id);
      expect(ps.map((p) => p.kind).sort(), id).toEqual(["booster", "box"]);
    }
    expect(products.some((p) => p.kind === "pack" || p.kind === "bundle")).toBe(false);
    expect(new Set(products.map((p) => p.sku)).size).toBe(16);
    expect(new Set(products.map((p) => p.slug)).size).toBe(16);
    const texto = JSON.stringify([products, guarantees]).toLowerCase();
    expect(texto).not.toMatch(/deluxe|デラックス/);
    // Storm Emeralda conserva los ids de sus fichas anteriores (favoritos y consultas históricas siguen apuntando a ellas)
    expect(products.find((p) => p.sku === "M6-JP-BOX")?.id).toBe("storm-caja");
    expect(products.find((p) => p.sku === "M6-JP-BOOSTER")?.id).toBe("storm-sobre");
  });

  it("el contenido físico es coherente entre caja, sobre y la fuente importada", async () => {
    for (const c of origen.collections) {
      const caja = products.find((p) => p.expansionIds[0] === c.id && p.kind === "box")!;
      const sobre = products.find((p) => p.expansionIds[0] === c.id && p.kind === "booster")!;
      const { cardsPerBooster: m, boostersPerBox: n } = c.physicalContents;
      expect(caja.contents.find((x) => x.label === "Sobres por caja")?.quantity, c.id).toBe(n);
      expect(caja.contents.find((x) => x.label === "Cartas por sobre")?.quantity).toBe(m);
      expect(caja.contents.find((x) => x.label === "Posiciones de carta por caja")?.quantity).toBe(n * m);
      expect(sobre.contents[0].quantity).toBe(m);
      expect(caja.title).toContain(`${n} sobres`);
      expect(sobre.title).toMatch(/Sobre individual/);
    }
  });

  it("las imágenes son las originales: huella intacta, caja cerrada primero y exhibición abierta como vista secundaria", async () => {
    expect(imagenes).toHaveLength(24);
    for (const img of imagenes) {
      const sha = crypto.createHash("sha256").update(fs.readFileSync(pub(img.src))).digest("hex");
      expect(sha, img.src).toBe(img.sha256);
      expect(img.permissionStatus).toBe("not_granted_by_source_link");
    }
    // recortes de presentación: huella y medidas coinciden con el archivo, vienen de un original verificado y no se agranda nada
    expect(recortes).toHaveLength(imagenes.length);
    for (const r of recortes) {
      const orig = imagenes.find((o) => o.src === r.original)!;
      expect(r.originalSha256, r.src).toBe(orig.sha256);
      const buf = fs.readFileSync(pub(r.src));
      expect(crypto.createHash("sha256").update(buf).digest("hex"), r.src).toBe(r.sha256);
      expect(Math.max(r.width, r.height), r.src).toBeLessThanOrEqual(Math.max(orig.width, orig.height) * 1.1);
    }
    for (const p of products) {
      expect(p.images.every((i) => i.status === "reference" && fs.existsSync(pub(i.src)))).toBe(true);
      if (p.kind === "box") {
        expect(p.images).toHaveLength(2);
        expect(p.images[0].src).toMatch(/caja-referencia-2-original/); // cerrada
        expect(p.images[0].alt).toMatch(/cerrada/);
        expect(p.images[1].src).toMatch(/caja-referencia-1-original/); // exhibición abierta
        expect(p.images[1].alt).toMatch(/no es el estado del artículo que se vende/);
      } else {
        expect(p.images).toHaveLength(1);
        expect(p.images[0].src).toMatch(/sobre-original/);
      }
      expect(p.images.every((i) => i.src.includes(`/${p.expansionIds[0]}/`)), p.id).toBe(true); // la imagen es de su colección
      expect(p.images.every((i) => /Sin permiso de uso concedido/.test(i.license))).toBe(true);
      // el original (sin transparencia = JPG) marca el derivado como opaco para mostrarlo sobre blanco
      for (const i of p.images) {
        const rec = recortes.find((r) => r.src === i.src)!;
        const orig = imagenes.find((o) => o.src === rec.original)!;
        expect(i.opaque, i.src).toBe(!rec.hasAlpha); // el derivado puede tener alfa aunque el original sea un JPG opaco
        expect(i.origin).toBe(orig.sourceUrl); // el registro de origen es el de la foto original
        expect(i.license).toContain(rec.original);
      }
    }
  });
});

describe("precio y stock pendientes", () => {
  it("ningún producto trae un precio ni un stock inventados: todos quedan pendientes y no son comprables", async () => {
    for (const p of products) {
      expect(p.priceMinor, p.sku).toBeNull();
      expect(p.stockQuantity, p.sku).toBeNull();
      expect(commercialState(p)).toBe("pending");
      expect(isPurchasable(p)).toBe(false);
      expect(maxFor(p)).toBe(0);
      expect(priceLabel(p)).toBe("Precio a confirmar");
    }
  });

  it("el servidor rechaza un SKU pendiente aunque la petición traiga precio y cantidad válidos", async () => {
    const db = await openTestDb();
    const ev = evaluateCart([{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1850000 }], products);
    expect(ev.lines[0].status).toBe("pending_commercial");
    expect(ev.lines[0].unitPriceMinor).toBeUndefined(); // nunca $0
    let info;
    try {
      await createInquiry(db, { items: [{ productId: "storm-caja", quantity: 1, expectedPriceMinor: 1850000 }], delivery: { method: "retiro", pickupPoint: "haedo" }, payment: "coordinar", idempotencyKey: "pendiente-clave-0000001", acceptPriceChanges: true }, { sessionTokenHash: hashToken("s"), products });
    } catch (e) {
      info = (e as InquiryError).info;
    }
    expect(info).toMatchObject({ status: 409, code: "pending_commercial" });
  });

  it("con precio y stock confirmados el mismo producto pasa a ser comprable", async () => {
    const listo = products.map((p) => (p.id === "storm-caja" ? { ...p, priceMinor: 1850000, stockQuantity: 3 } : p));
    const ev = evaluateCart([{ productId: "storm-caja", quantity: 2, expectedPriceMinor: 1850000 }, { productId: "storm-sobre", quantity: 1 }], listo);
    expect(ev.lines.map((l) => l.status)).toEqual(["ok", "pending_commercial"]); // el sobre sigue pendiente: precio y stock son independientes por SKU
    expect(maxFor(listo.find((p) => p.id === "storm-caja")!)).toBe(3);
    const soloPrecio = { ...products[0], priceMinor: 100000 }; // precio sin stock: sigue pendiente (no es «agotado»)
    expect(commercialState(soloPrecio)).toBe("pending");
    expect(commercialState({ priceMinor: 100000, stockQuantity: 0 })).toBe("soldout");
  });

  it("filtros: japonés, expansión, formato; el precio pendiente no se trata como $0 ni se cuela en un rango", async () => {
    const f = (q: Record<string, string>) => filterProducts(products, expansions, parseQuery(q));
    expect(f({ idioma: "ja" })).toHaveLength(16);
    expect(f({ idioma: "en" })).toHaveLength(0);
    expect(f({ formato: "caja" })).toHaveLength(8);
    expect(f({ formato: "sobre" })).toHaveLength(8);
    expect(f({ expansion: "abyss-eye" })).toHaveLength(2);
    expect(f({ q: "M6-JP" })).toHaveLength(2); // búsqueda por código/SKU
    expect(f({ q: "storm" })).toHaveLength(2);
    expect(f({ pmax: "100000" })).toHaveLength(0);
    expect(f({ pmin: "1" })).toHaveLength(0);
    expect(f({ disp: "stock" })).toHaveLength(0); // sin stock confirmado, ninguno figura «con stock»
    expect(f({ orden: "precio-asc" })).toHaveLength(16);
  });

  it("los destacados del inicio existen y son productos reales", async () => {
    const ids = realCatalog.featuredIds ?? [];
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(ids.length).toBeLessThanOrEqual(4);
    for (const id of ids) expect(products.find((p) => p.id === id)?.isDemo).toBe(false);
  });
});

describe("importación de precios y stock desde la tabla del dueño", () => {
  const skus = realCatalog.products.map((p) => p.sku); // japonés y chino
  const csv = (rows: string[]) => ["sku;coleccion;formato;idioma;precio_ars;stock_unidades;estado_del_sellado;observaciones", ...rows].join("\n");
  it("la tabla entregada está vacía: todo queda pendiente", async () => {
    const r = parseCommercialCsv(fs.readFileSync(path.resolve("datos/precios-y-stock.csv"), "utf8"), skus);
    expect(r.errors).toEqual([]);
    expect(r.rows).toBe(realCatalog.products.filter((p) => !p.retired).length); // 22 japoneses + 28 chinos publicados, todos en blanco
    expect(r.items).toEqual({});
  });
  it("interpreta precios argentinos y stock; vacío = pendiente (nunca cero)", async () => {
    expect(parsePriceToMinor("9500")).toBe(950000);
    expect(parsePriceToMinor("$ 9.500")).toBe(950000);
    expect(parsePriceToMinor("185.000,50")).toBe(18500050);
    expect(parsePriceToMinor("")).toBeNull();
    for (const mal of ["0", "-5", "9.5", "abc", "1,234,5", "9,999"]) expect(() => parsePriceToMinor(mal), mal).toThrow();
    const r = parseCommercialCsv(csv(["M6-JP-BOX;Storm Emeralda;Caja;Japones;185.000;3;Sellada de fábrica;", "M6-JP-BOOSTER;Storm Emeralda;Sobre;Japones;9500;;;"]), skus);
    expect(r.errors).toEqual([]);
    expect(r.items["M6-JP-BOX"]).toEqual({ priceMinor: 18500000, stockQuantity: 3, ownerSealCondition: "Sellada de fábrica" });
    expect(r.items["M6-JP-BOOSTER"]).toMatchObject({ priceMinor: 950000, stockQuantity: null }); // sin stock: sigue pendiente
    expect(r.warnings.join("\n")).toMatch(/M6-JP-BOOSTER: queda pendiente \(stock vacío\)/);
  });
  it("rechaza SKU desconocidos, repetidos, stock inválido o columnas faltantes", async () => {
    expect(parseCommercialCsv(csv(["XX-1;a;b;c;100;1;;"]), skus).errors.join()).toMatch(/no existe en el catálogo/);
    expect(parseCommercialCsv(csv(["M6-JP-BOX;a;b;c;100;1;;", "M6-JP-BOX;a;b;c;200;2;;"]), skus).errors.join()).toMatch(/repetido/);
    expect(parseCommercialCsv(csv(["M6-JP-BOX;a;b;c;100;-1;;"]), skus).errors.join()).toMatch(/stock inválido/);
    expect(parseCommercialCsv(csv(["M6-JP-BOX;a;b;c;100;1.5;;"]), skus).errors.join()).toMatch(/stock inválido/);
    expect(parseCommercialCsv("sku;otra\nM6-JP-BOX;x", skus).errors.join()).toMatch(/falta la columna/);
  });
});

describe("garantías de composición (alcance exacto y fuentes)", () => {
  const de = (productId: string) => guarantees.filter((g) => g.scope === productId);
  const idsDe = (col: string, kind: "box" | "booster") => products.find((p) => p.expansionIds[0] === col && p.kind === kind)!.id;

  it("cada garantía pertenece a un producto japonés, cita fuentes que existen y son oficiales; ninguna es de rareza ni promo de compra", async () => {
    const srcIds = new Set(sources.map((s) => s.id));
    for (const g of guarantees) {
      const p = products.find((x) => x.id === g.scope)!;
      expect(p, g.id).toBeTruthy();
      expect(p.guaranteeIds).toContain(g.id);
      expect(g.language).toBe("ja");
      expect(g.evidence).toBe("official");
      expect(g.sourceIds.length).toBeGreaterThan(0);
      for (const s of g.sourceIds) expect(srcIds.has(s), `${g.id} → ${s}`).toBe(true);
      expect(["physical_contents", "composition"]).toContain(g.type); // sin garantías de rareza ni promos fijas
    }
    expect(guarantees.filter((g) => /promo|regalo|sorteo|concurso/i.test(g.statement))).toEqual([]); // promos de Pokémon Center no son contenido del SKU
  });

  it("composición exacta por colección y por formato (caja y sobre separados)", async () => {
    const tipos = (id: string) => de(id).map((g) => g.id.replace(`g-${id}-`, "")).sort();
    for (const col of ["black-bolt", "white-flare"]) for (const k of ["box", "booster"] as const) expect(tipos(idsDe(col, k)), `${col} ${k}`).toEqual(["2-brillantes", "contenido"]);
    for (const k of ["box", "booster"] as const) expect(tipos(idsDe("mega-dream-ex", k))).toEqual(["1-ex", "contenido"]);
    for (const k of ["box", "booster"] as const) expect(tipos(idsDe("30th-celebration", k))).toEqual(["contenido", "pikachu-energia", "todas-brillantes"]);
    for (const col of ["heat-wave-arena", "inferno-x", "storm-emeralda", "abyss-eye"]) for (const k of ["box", "booster"] as const) expect(tipos(idsDe(col, k)), col).toEqual(["contenido"]);
    // la AR garantizada del Deluxe NO se aplica a Black Bolt / White Flare estándar
    // (la ficha aclara que dos cartas brillantes NO equivalen a dos AR, pero no promete ninguna AR)
    expect(de(idsDe("black-bolt", "booster")).map((g) => g.statement).join(" ")).not.toMatch(/AR garantizad|garantiza[n]? \d+ AR|\d+ AR por/);
    expect(de(idsDe("black-bolt", "booster")).map((g) => g.statement).join(" ")).toMatch(/no equivalen a dos AR/);
    // la garantía de una familia no es una probabilidad: no hay tasas
    expect(realCatalog.pullRates).toEqual([]);
    for (const p of products) expect(ratesForProduct(p, realCatalog.pullRates)).toEqual([]);
  });

  it("MEGA Dream ex: «1 carta ex o Mega ex» se apoya en el texto del envase, sin nombrar una carta concreta ni SAR", async () => {
    const g = de(idsDe("mega-dream-ex", "booster")).find((x) => x.type === "composition")!;
    expect(g.statement).toMatch(/Pokémon ex o Mega Evolution ex/);
    expect(g.statement).toMatch(/No es una carta concreta ni una SAR/);
    const envase = sources.find((s) => s.id === g.sourceIds[0])!;
    expect(envase.scope).toContain("ポケモンexまたはメガシンカex");
    const v = groupGuarantees(de(idsDe("mega-dream-ex", "box")));
    expect(v.composition).toHaveLength(1);
    expect(v.physical).toHaveLength(1);
  });

  it("30th CELEBRATION: Pikachu del aniversario y Energía básica por sobre, sin prometer una ilustración", async () => {
    const g = de(idsDe("30th-celebration", "booster")).find((x) => x.id.endsWith("pikachu-energia"))!;
    expect(g.statement).toMatch(/1 carta especial de Pikachu/);
    expect(g.statement).toMatch(/1 carta de Energía básica/);
    expect(g.statement).toMatch(/No garantiza una ilustración concreta/);
  });
});

describe("galerías de cartas (cobertura verificable)", () => {
  it("«completa» solo si la numeración va de 1 al máximo sin huecos y coincide con la fuente; «parcial» documenta exactamente qué falta", async () => {
    for (const e of expansions) {
      const cov = coverageOf(e.cards.map((c) => c.number));
      expect(e.cardListStatus, e.id).toBe(cov.status);
      expect(e.officialCardCount, e.id).toBe(e.cards.length);
      expect(e.cardListNote, e.id).toBeTruthy();
      if (cov.status === "partial") expect(e.cardListNote).toContain(formatRanges(cov.missing));
      expect(new Set(e.cards.map((c) => c.id)).size).toBe(e.cards.length);
      expect(e.cards.every((c) => c.name.length > 0 && !c.isDemo && c.image.status === "reference")).toBe(true);
    }
    const parciales = expansions.filter((e) => e.cardListStatus === "partial").map((e) => e.id).sort();
    expect(parciales).toEqual(["30th-celebration", "storm-emeralda"]);
    expect(expansions.find((e) => e.id === "storm-emeralda")!.cardListNote).toMatch(/71, 73 y 75/);
    expect(expansions.find((e) => e.id === "30th-celebration")!.cardListNote).toMatch(/104–135 y 151/);
  });

  it("cada carta pertenece a su set (imagen en su carpeta), tiene imagen en disco y su rareza viene del ícono oficial", async () => {
    for (const e of expansions) {
      for (const c of e.cards) {
        expect(c.expansionId).toBe(e.id);
        expect(c.image.src.startsWith(`/images/expansions/${e.id}/cards/`)).toBe(true);
        expect(fs.existsSync(pub(c.image.src)), c.image.src).toBe(true);
      }
    }
    // Black Bolt y White Flare no se mezclan: ninguna carta comparte archivo de imagen entre las dos listas
    const bb = new Set(expansions.find((e) => e.id === "black-bolt")!.cards.map((c) => c.image.src.split("/").pop()));
    expect(expansions.find((e) => e.id === "white-flare")!.cards.some((c) => bb.has(c.image.src.split("/").pop()))).toBe(false);
    expect(rarityFromIcon("ic_rare_sr_c")).toBe("SR");
    expect(rarityFromIcon("ic_rare_c_c")).toBe("C");
    expect(rarityFromIcon("ic_rare_sar")).toBe("SAR");
    expect(rarityFromIcon("ic_rare_MUR")).toBe("MUR");
    expect(rarityFromIcon(null)).toBeUndefined(); // sin ícono no se infiere rareza
  });

  it("el catálogo real valida sin errores (fuentes, imágenes, guardas de duplicados)", async () => {
    const errores = validateCatalog(realCatalog, (p) => fs.existsSync(pub(p))).filter((i) => i.level === "error");
    expect(errores).toEqual([]);
  });

  it("la validación detecta una caja o un sobre duplicados y una lista «completa» con huecos", async () => {
    const dup = structuredClone(realCatalog);
    dup.products.push({ ...dup.products[0], id: "otra-caja", sku: "OTRO-SKU", slug: "otra-caja" });
    expect(validateCatalog(dup, () => true).map((i) => i.message).join()).toMatch(/duplica a/);
    const hueco = structuredClone(realCatalog);
    hueco.expansions.find((e) => e.id === "storm-emeralda")!.cardListStatus = "complete";
    expect(validateCatalog(hueco, () => true).map((i) => i.message).join()).toMatch(/huecos o repetidos/);
  });
});

describe("cobertura y URLs", () => {
  it("coverageOf y formatRanges", async () => {
    expect(coverageOf(["001", "002", "003"]).status).toBe("complete");
    expect(coverageOf(["001", "003", null])).toMatchObject({ status: "partial", missing: [2], unnumbered: 1 });
    expect(coverageOf(["001", "001"]).status).toBe("partial");
    expect(formatRanges([71, 73, 75])).toBe("71, 73 y 75");
    expect(formatRanges([104, 105, 106, 107, 151])).toBe("104–107 y 151");
  });

  it("las URLs de los productos de demostración redirigen al catálogo; las de Storm Emeralda se conservan", async () => {
    vi.stubEnv("CATALOG_FIXTURE", "");
    const reglas = (await nextConfig.redirects!()) as Array<{ source: string; destination: string }>;
    vi.stubEnv("CATALOG_FIXTURE", "demo");
    expect(await nextConfig.redirects!()).toEqual([]); // con el catálogo de prueba las URLs de demostración siguen existiendo (solo pruebas)
    vi.unstubAllEnvs();
    expect(reglas.find((r) => r.source === "/productos/storm-emeralda-pack-5-sobres")?.destination).toBe("/sellados");
    expect(reglas.find((r) => r.source === "/expansiones/set-de-ejemplo")?.destination).toBe("/expansiones");
    expect(reglas.some((r) => /storm-emeralda-(caja|sobre)$/.test(r.source) || r.source === "/expansiones/storm-emeralda")).toBe(false);
    for (const p of products) expect(reglas.some((r) => r.source === `/productos/${p.slug}`)).toBe(false); // ningún producto real se redirige
  });
});

describe("arte del banner del inicio (recurso registrado)", () => {
  it("el archivo coincide con su registro y deriva de una carta oficial verificada de Storm Emeralda", async () => {
    expect(arteInicio.length).toBeGreaterThan(0);
    for (const a of arteInicio) {
      const buf = fs.readFileSync(path.join(process.cwd(), "public", a.src));
      expect(crypto.createHash("sha256").update(buf).digest("hex"), a.src).toBe(a.sha256);
      const carta = (imagenesCartas as Record<string, { sourceSha256: string; sourceUrl: string; permissionStatus: string }>)[`${a.derivedFrom.collectionId}/${a.derivedFrom.cardId}`];
      expect(carta.sourceSha256).toBe(a.derivedFrom.sourceSha256);
      expect(a.sourceUrl).toBe(carta.sourceUrl);
      expect(a.status).toBe("reference");
      expect(a.permissionStatus).toBe("not_granted_by_source_link");
      expect(a.origin).toMatch(/pokemon-card.com/);
      expect(a.license).toMatch(/Sin permiso de uso concedido/);
      // se recortó (no se agrandó) y queda dentro de la carta original
      expect(a.width).toBe(a.derivedFrom.crop.width);
      expect(a.derivedFrom.crop.top + a.derivedFrom.crop.height).toBeLessThanOrEqual(Number(a.derivedFrom.sourceSize.split("x")[1]));
    }
  });
});

describe("referencias chinas de Tmall (conciliación con la importación)", () => {
  it("son 5 únicas: 4 ya son fichas del catálogo (sin duplicarse) y 1 sigue pendiente sin inventar datos", async () => {
    const t = (await import("@/content/colecciones/origen/tmall-pendientes.json")).default as { items: Array<{ articleId: string; estado: string; importadoComo?: string; nombre: string | null; precioMinor: number | null; stock: number | null }> };
    expect(new Set(t.items.map((i) => i.articleId)).size).toBe(5);
    const importados = t.items.filter((i) => i.estado === "importado_desde_carpeta_local");
    expect(importados.map((i) => i.articleId).sort()).toEqual(["1049188091485", "1050867876169", "1063240655679", "1070165751188"]);
    for (const i of importados) {
      expect(realCatalog.products.filter((p) => p.id === i.importadoComo), i.articleId).toHaveLength(1);
      expect(realCatalog.products.find((p) => p.id === i.importadoComo)?.sku, i.articleId).toContain(i.articleId);
    }
    const pendientes = t.items.filter((i) => i.estado !== "importado_desde_carpeta_local");
    expect(pendientes.map((i) => i.articleId)).toEqual(["1027185914261"]);
    for (const i of t.items) {
      expect(i.precioMinor).toBeNull();
      expect(i.stock).toBeNull();
    }
    for (const i of pendientes) expect(i.nombre).toBeNull();
    // ninguna ficha del catálogo corresponde al artículo pendiente
    expect(realCatalog.products.some((p) => p.sku.includes("1027185914261"))).toBe(false);
    const { products } = await import("@/content/real/products");
    expect(products.some((p) => p.language === "zh")).toBe(false); // el lote japonés sigue siendo solo japonés
  });
});
