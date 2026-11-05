import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import datos from "@/content/colecciones/origen/china/productos.json";
import registro from "@/content/colecciones/imagenes-china.json";
import { commercialState, isPurchasable, priceLabel } from "@/features/catalog/commercial";
import { filterProducts, parseQuery } from "@/features/catalog/query";
import { ratesForProduct } from "@/features/catalog/pull-rates";
import { validateCatalog } from "@/features/catalog/validate";
import { evaluateCart } from "@/features/inquiries/pricing";
import { kindLabel } from "@/content/schema";
import { applyOverrides } from "@/features/catalog/overrides";

// Lote chino: 16 carpetas de Tmall/Taobao → fichas del catálogo real. Ninguna prueba depende de la carpeta Downloads del equipo.
const all = realCatalog.products;
const zh = all.filter((p) => p.language === "zh" && !p.id.startsWith("zh-151-") && p.id !== "zh-30-zhounian-caja");
/** Fichas chinas publicadas (sin las retiradas). */
const zhPub = zh.filter((p) => p.active);
const zhExp = realCatalog.expansions.filter((e) => e.language === "zh");
const pub = (p: string) => path.join(process.cwd(), "public", p.replace(/^\//, ""));
const f = (q: Record<string, string>) => filterProducts(all, realCatalog.expansions, parseQuery(q));
const count = (kind: string) => zhPub.filter((p) => p.kind === kind).length;

describe("catálogo chino: cobertura de las 16 fuentes y formatos", () => {
  it("hay 37 fichas y 18 colecciones en chino simplificado (China), sin demo, con ids, SKU y slugs únicos", () => {
    expect(zh).toHaveLength(37);
    expect(zhExp).toHaveLength(18);
    expect(zh.every((p) => p.region === "CN" && !p.isDemo && p.currency === "ARS")).toBe(true);
    // 36 importadas; 8 sobres individuales de 20 cartas retirados de la oferta pública (siguen en el catálogo para el historial)
    expect(zhPub).toHaveLength(28);
    expect(zh.filter((p) => p.retired)).toHaveLength(8);
    expect(zh.filter((p) => p.retired).every((p) => !p.active)).toBe(true);
    expect(zhExp.filter((e) => e.id !== "zh-30-zhounian").every((e) => e.region === "CN" && !e.isDemo && e.cards.length === 0 && e.cardListStatus === "unavailable")).toBe(true);
    for (const k of ["id", "sku", "slug"] as const) expect(new Set(all.map((p) => p[k])).size, k).toBe(all.length);
    expect(new Set(all.map((p) => p.sku)).size).toBe(64);
  });

  it("las 16 fuentes del dueño están representadas por al menos una ficha y cada ficha cita su fuente", () => {
    expect(datos.fuentes).toHaveLength(17);
    for (const fu of datos.fuentes) {
      expect(zh.some((p) => p.sku.includes(fu.id)), fu.id).toBe(true);
      const src = realCatalog.sources.find((s) => s.id === `zh-src-${fu.id}`);
      expect(src?.url, fu.id).toBe(fu.url);
    }
    for (const p of zh) {
      const g = realCatalog.guarantees.filter((x) => p.guaranteeIds.includes(x.id));
      expect(g.length, p.id).toBe(1);
      expect(g[0].evidence).toBe("seller_pack_contents");
      expect(g[0].type).toBe("physical_contents");
      expect(g[0].sourceIds.every((s) => realCatalog.sources.some((x) => x.id === s))).toBe(true);
    }
  });

  it("formatos: sobres, cajas, kits de mazo, cajas especiales, sets de ilustraciones y un bundle", () => {
    expect(count("booster")).toBe(16); // 24 importados − 8 retirados (sobres de 20 cartas)
    expect(count("box")).toBe(4);
    expect(count("kit")).toBe(3);
    expect(count("special-box")).toBe(2);
    expect(count("illustration-set")).toBe(2);
    expect(count("bundle")).toBe(1);
    expect(kindLabel.kit).toBe("Kit de mazo");
    // kits y cajas especiales no se fuerzan a ser una caja de sobres ni a una colección ficticia
    for (const p of zh.filter((x) => x.kind === "kit" || x.kind === "special-box")) expect(p.expansionIds, p.id).toEqual([]);
  });

  it("las fichas de 5 y 20 cartas de 共逐荣光 comparten colección pero son productos distintos, con fotos distintas", () => {
    const a = zh.find((p) => p.id === "zh-gongzhu-rongguang-sobre-5")!;
    const b = zh.find((p) => p.id === "zh-gongzhu-rongguang-sobre-20")!;
    expect(a.expansionIds).toEqual(b.expansionIds);
    expect(a.variant).toBe("5 cartas");
    expect(b.variant).toBe("20 cartas");
    expect(a.active).toBe(true);
    expect(b.active).toBe(false); // el de 20 cartas está retirado
    expect(a.sku).not.toBe(b.sku);
    expect(a.images[0].src).not.toBe(b.images[0].src);
    expect(a.contents[0].quantity).toBe(5);
    expect(b.contents[0].quantity).toBe(20);
  });

  it("Vol.2 y Vol.3 son fichas distintas; el 30.º chino no pisa al 30th CELEBRATION japonés", () => {
    const v2 = zh.find((p) => p.id === "zh-30-zhounian-ilustraciones-vol2")!;
    const v3 = zh.find((p) => p.id === "zh-30-zhounian-ilustraciones-vol3")!;
    expect(v2.variant).toBe("Vol.2");
    expect(v3.variant).toBe("Vol.3");
    expect(v2.contents.some((c) => /星彩晶璃/.test(c.label))).toBe(true);
    expect(v3.contents.some((c) => /共逐荣光/.test(c.label))).toBe(true);
    const ja30 = all.filter((p) => p.expansionIds.includes("30th-celebration"));
    expect(ja30.map((p) => p.id).sort()).toEqual(["30th-celebration-caja", "30th-celebration-sobre"]);
    expect(ja30.every((p) => p.language === "ja")).toBe(true);
    const zh30 = zh.filter((p) => p.expansionIds.includes("zh-30-zhounian"));
    expect(zh30.length).toBe(5); // sobre, set con monedas, Vol.2, Vol.3 y la carta P de Bulbasaur (borrador)
    const imgsJa = new Set(ja30.flatMap((p) => p.images.map((i) => i.src)));
    for (const p of zh30) for (const i of p.images) expect(imgsJa.has(i.src)).toBe(false);
  });

  it("el kit de manualidades de la publicación del aniversario NO se importó como producto TCG", () => {
    const usados = datos.productos.filter((p) => p.fuente === "1079986406064").flatMap((p) => p.imagenes.map((i) => i.archivo));
    expect(usados).not.toContain("SKU_01.jpg");
    expect(zh.some((p) => /手办|manualidades/i.test(p.title + p.description))).toBe(false);
  });

  it("los dos kits de mazo y las dos cajas de Ogerpon son productos diferentes", () => {
    expect(new Set(zh.filter((p) => p.kind === "kit").map((p) => p.sku)).size).toBe(3);
    const [a, b] = zh.filter((p) => p.kind === "special-box");
    expect(a.title).not.toBe(b.title);
    expect(a.images[0].src).not.toBe(b.images[0].src);
    expect(a.contents).toEqual(b.contents); // mismo contenido, distinto tema: se documenta como tal
  });
});

describe("catálogo chino: precio y stock no se inventan; compra deshabilitada", () => {
  it("todas las fichas chinas quedan «Precio a confirmar» y no comprables; el servidor las rechaza aunque lleguen precio y cantidad", () => {
    for (const p of zh) {
      expect(p.priceMinor, p.sku).toBeNull();
      expect(p.stockQuantity, p.sku).toBeNull();
      expect(commercialState(p)).toBe("pending");
      expect(isPurchasable(p)).toBe(false);
      expect(priceLabel(p)).toBe("Precio a confirmar");
    }
    const ev = evaluateCart([{ productId: "zh-gongzhu-rongguang-sobre-5", quantity: 1, expectedPriceMinor: 100000 }], all);
    expect(ev.lines[0].status).toBe("pending_commercial");
  });

  it("no hay tasas de aparición ni garantías de rareza para las ediciones chinas", () => {
    expect(realCatalog.pullRates.some((r) => r.language === "zh")).toBe(false);
    for (const p of zh) expect(ratesForProduct(p, realCatalog.pullRates), p.id).toEqual([]);
    expect(realCatalog.guarantees.filter((g) => g.language === "zh").every((g) => g.type === "physical_contents")).toBe(true);
  });

  it("el catálogo completo (japonés + chino) valida sin errores", () => {
    const issues = validateCatalog(realCatalog, (p) => fs.existsSync(pub(p)));
    expect(issues.filter((i) => i.level === "error")).toEqual([]);
  });
});

describe("catálogo chino: fotos propias del proyecto, con procedencia", () => {
  it("cada imagen existe en el proyecto, coincide con su huella y no depende de rutas del equipo ni de enlaces del proveedor", () => {
    expect(registro).toHaveLength(51);
    for (const r of registro) {
      expect(r.src).toMatch(/^\/images\/products\/zh\/[a-z0-9-]+\.webp$/);
      const buf = fs.readFileSync(pub(r.src));
      expect(crypto.createHash("sha256").update(buf).digest("hex"), r.src).toBe(r.sha256);
      expect(r.origen.urlPublicacion).toMatch(/^https:\/\/(detail\.tmall|item\.taobao)\.com\/item\.htm\?id=\d+/);
      expect(r.origen.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const p of zh) {
      for (const i of p.images) {
        expect(i.src.startsWith("/images/products/zh/"), p.id).toBe(true);
        expect(i.source).toBe("supplier");
        expect(i.status).toBe("reference");
        expect(i.view, i.src).toBeDefined();
        expect(i.license).toMatch(/Sin permiso de uso concedido/);
        expect(i.origin).toMatch(/^https:\/\//);
      }
      expect(JSON.stringify(p)).not.toMatch(/[A-Z]:\\|Downloads|alicdn\.com/);
    }
  });

  it("no hay imágenes repetidas dentro de una ficha ni entre fichas (huellas distintas), ni reutilizadas del lote japonés", () => {
    const vistas = new Map<string, string>();
    for (const p of all) {
      for (const i of p.images) {
        if (i.status === "demo" && i.src === "/images/products/foto-pendiente.svg") continue;
        const h = crypto.createHash("sha256").update(fs.readFileSync(pub(i.src))).digest("hex");
        expect(vistas.get(h), `${p.id}: ${i.src} repite ${vistas.get(h)}`).toBeUndefined();
        vistas.set(h, i.src);
      }
    }
  });

  it("la primera imagen de cada ficha es la unidad vendida (sobre, caja o kit); los gráficos de contenido van después y se rotulan", () => {
    // Única excepción documentada: el material del proveedor de 宝石包 VOL.6 no trae una foto limpia de la caja (solo un render
    // diminuto dentro de un cartel), así que la primera imagen son los sobres que trae, rotulados como tales.
    const sinFotoDeLaUnidad = ["zh-baoshibao-vol6-caja"];
    for (const p of zh) {
      if (!sinFotoDeLaUnidad.includes(p.id)) expect(p.images[0].view, p.id).not.toBe("contents");
      else expect(p.images[0].alt).toMatch(/sobres de .* que trae la caja/);
      for (const i of p.images.slice(1).filter((x) => x.view === "contents")) expect(i.alt).toMatch(/según el gráfico del proveedor/);
    }
  });
});

describe("catálogo chino: búsqueda y filtros", () => {
  it("idioma, formato y colección", () => {
    expect(f({ idioma: "zh" })).toHaveLength(31);
    expect(f({ idioma: "ja" })).toHaveLength(22); // 16 + las seis cajas del 14/10/2026
    expect(f({ formato: "kit" })).toHaveLength(3);
    expect(f({ formato: "especial" })).toHaveLength(2);
    expect(f({ formato: "ilustraciones" })).toHaveLength(2);
    expect(f({ formato: "caja", idioma: "zh" })).toHaveLength(7);
    expect(f({ formato: "caja" })).toHaveLength(21);
    expect(f({ formato: "sobre" })).toHaveLength(24); // 8 japoneses + 16 chinos
    expect(f({ expansion: "zh-gongzhu-rongguang" })).toHaveLength(1); // el de 20 cartas fue retirado
    expect(f({ expansion: "zh-30-zhounian" })).toHaveLength(5);
  });
  it("se busca por nombre chino, por romanización, por código del envase y por texto en español", () => {
    expect(f({ q: "真实玄虚" }).map((p) => p.id)).toEqual(["zh-zhenshi-xuanxu-sobre-5"]);
    expect(f({ q: "zhenshi xuanxu" })).toHaveLength(1);
    expect(f({ q: "csv6C" })).toHaveLength(1);
    expect(f({ q: "kit de mazo" })).toHaveLength(3);
    expect(f({ q: "ogerpon" })).toHaveLength(2);
    expect(f({ q: "storm" })).toHaveLength(2); // sigue encontrando las japonesas
  });
  it("paginación: 53 sellados públicos, accesorios solo como adicionales, en 5 páginas de 12", () => {
    expect(f({})).toHaveLength(53);
    expect(Math.ceil(f({}).length / 12)).toBe(5);
  });
});

const CJK = /[\u3400-\u9fff]/;

describe("catálogo chino: nombre principal en inglés, nombres anteriores como alias", () => {
  it("el nombre de cada colección es el inglés (sin caracteres chinos), el original queda aparte y la denominación está rotulada", () => {
    for (const e of zhExp) {
      expect(e.name, e.id).not.toMatch(CJK);
      expect(e.originalName, e.id).toMatch(CJK);
      expect(e.nameInfo, e.id).toBeDefined();
      expect(e.nameInfo!.sourceIds.length, e.id).toBeGreaterThan(0);
      expect(e.nameInfo!.sourceIds.every((s) => realCatalog.sources.some((x) => x.id === s)), e.id).toBe(true);
      expect(e.summary, e.id).toMatch(/NO un nombre oficial|nombre oficial impreso/);
    }
    // ninguna colección china, salvo 30th Celebration (impreso en el envase), se presenta como oficial
    expect(zhExp.filter((e) => e.nameInfo!.kind === "official").map((e) => e.id)).toEqual(["zh-30-zhounian"]);
  });
  it("el título principal es «nombre inglés · formato en español» y no empieza con caracteres chinos", () => {
    for (const p of zh) {
      expect(p.title, p.id).not.toMatch(/^[\u3400-\u9fff]/);
      expect(p.title, p.id).toMatch(/ · (Sobre de \d+ cartas|Caja|Caja de 18 sobres|Caja especial|Set con monedas|Kit de mazo|Kit de 4 mazos|Vol\.\d|Bulbasaur)$/);
      expect(p.originalTitle, p.id).toMatch(CJK);
      if (p.active) expect(f({ q: p.originalTitle! }).map((x) => x.id), p.id).toContain(p.id);
    }
  });
  it("los nombres españoles anteriores, el chino, la romanización y las variantes en inglés siguen siendo búsquedas válidas", () => {
    expect(f({ q: "Gran Reunión Teracristal" }).map((p) => p.id).sort()).toEqual(["zh-taijing-shengju-caja", "zh-taijing-shengju-sobre-10"]);
    expect(f({ q: "太晶盛聚" })).toHaveLength(2);
    expect(f({ q: "taijing shengju" })).toHaveLength(2);
    expect(f({ q: "terastal gathering" })).toHaveLength(2);
    expect(f({ q: "Terastal Grand Gathering" })).toHaveLength(2);
    expect(f({ q: "Ilusión Resplandeciente" }).length).toBeGreaterThan(0);
    expect(f({ q: "Sparkling Fantasy" }).length).toBeGreaterThan(0); // variante de csv8C vista en una fuente
    expect(f({ q: "Pack Gema" })).toHaveLength(1);
    expect(f({ q: "Raging Bolt" })).toHaveLength(1);
  });
  it("las colecciones japonesas conservan su nombre y un nombre inglés compartido no mezcla idioma, código ni galería", () => {
    const ja30 = realCatalog.expansions.find((e) => e.id === "30th-celebration")!;
    const zh30 = realCatalog.expansions.find((e) => e.id === "zh-30-zhounian")!;
    expect(ja30.name).toBe("30th CELEBRATION");
    expect(zh30.name).toBe("30th Celebration");
    expect(ja30.language).toBe("ja");
    expect(zh30.language).toBe("zh");
    expect(zh30.cards).toHaveLength(76);
    expect(zh30.cardListStatus).toBe("partial");
    expect(zh30.cards.every((card) => card.sourceIds.includes("zh-30th-cartas-oficial"))).toBe(true);
    expect(ja30.cards.length).toBeGreaterThan(0);
    expect(f({ expansion: "zh-30-zhounian" }).every((p) => p.language === "zh")).toBe(true);
  });
  it("Prismatic Evolutions y sparking no se usan como nombre de ninguna colección china (no son equivalentes verificados)", () => {
    const nombres = zhExp.map((e) => e.name).concat(zh.map((p) => p.title)).join(" | ");
    expect(nombres).not.toMatch(/Prismatic|Surging|Sparking/i);
    expect(zhExp.find((e) => e.id === "zh-taijing-shengju")!.name).toBe("Terastal Gathering");
  });
  it("las fichas conservan slug, id y SKU", () => {
    expect(zh.map((p) => p.slug)).toEqual(zh.map((p) => p.id));
    expect(zh.find((p) => p.sku === "ZH-1070975018438")!.slug).toBe("zh-baoshibao-vol6-caja");
  });
  it("kits y cajas especiales: nombre inglés propio con su denominación y sin colección única", () => {
    const kit = zh.find((p) => p.id === "zh-kit-mengleigu-ex")!;
    expect(kit.title).toBe("Master Strategy Deck Building Set: Raging Bolt ex · Kit de mazo");
    expect(kit.nameInfo!.kind).toBe("community");
    expect(zh.find((p) => p.id === "zh-caja-ogerpon-fuego")!.nameInfo!.certainty).toBe("inferred");
    expect(zh.find((p) => p.id === "zh-30-zhounian-ilustraciones-vol2")!.nameInfo!.kind).toBe("descriptive");
  });
});

describe("catálogo chino: sobres individuales de 20 cartas retirados", () => {
  const retirados = zh.filter((p) => p.retired);
  it("se retiran exactamente los sobres individuales cuyo contenido es de 20 cartas por sobre (ocho)", () => {
    const por = (p: (typeof zh)[number]) => p.contents.find((c) => /cartas por sobre/i.test(c.label))?.quantity;
    const esperados = all.filter((p) => p.kind === "booster" && por(p) === 20).map((p) => p.id).sort();
    expect(retirados.map((p) => p.id).sort()).toEqual(esperados);
    expect(esperados).toEqual(["zh-cuican-guihuan-sobre-20", "zh-gengu-kailai-sobre-20", "zh-gongzhu-rongguang-sobre-20", "zh-heijing-chicheng-sobre-20", "zh-jiajiang-huihe-sobre-20", "zh-liren-mengxing-sobre-20", "zh-qiji-qicheng-sobre-20", "zh-zhenshi-xuanxu-sobre-20"]);
    expect(retirados.every((p) => !p.active && p.retired!.reason.length > 0)).toBe(true);
  });
  it("no se retiró nada que no sea un sobre individual de 20 cartas: sobres de 5, 6, 7 y 10, cajas, kits y cajas especiales siguen publicados", () => {
    for (const p of all.filter((x) => !x.retired && !x.draftNote)) expect(p.active, p.id).toBe(true);
    for (const id of ["zh-kit-mengleigu-ex", "zh-kit-saifuhao-ex", "zh-kit-haipi-zuhe", "zh-caja-ogerpon-agua", "zh-caja-ogerpon-fuego", "zh-baoshibao-vol6-caja", "zh-taijing-shengju-sobre-10", "zh-shengxiang-xingyin-sobre-6", "black-bolt-caja", "white-flare-caja", "30th-celebration-caja"]) {
      expect(all.find((p) => p.id === id)!.active, id).toBe(true);
    }
    // las cajas japonesas que traen 20 sobres no se tocan
    expect(all.filter((p) => p.language === "ja").every((p) => p.active)).toBe(true);
  });
  it("no aparecen en búsquedas, filtros ni conteos públicos", () => {
    for (const p of retirados) {
      expect(f({ q: p.originalTitle! }).map((x) => x.id), p.id).not.toContain(p.id);
      expect(f({ q: p.sku }), p.sku).toHaveLength(0);
    }
    expect(f({ idioma: "zh", formato: "sobre" })).toHaveLength(16);
    expect(f({}).filter((p) => p.variant === "20 cartas")).toHaveLength(0);
  });
  it("un carrito viejo con un sobre de 20 cartas lo informa como retirado y no se puede consultar ni encargar", () => {
    const ev = evaluateCart([{ productId: "zh-zhenshi-xuanxu-sobre-20", quantity: 1, expectedPriceMinor: 100 }, { productId: "zh-jiajiang-huihe-sobre-20", quantity: 2, mode: "encargo" }], all);
    expect(ev.lines.map((l) => l.status)).toEqual(["retired", "retired"]);
    expect(ev.blocking).toHaveLength(2);
    expect(ev.lines[0].product?.title).toBe("Arcane Truth · Sobre de 20 cartas");
  });
  it("el panel del dueño no puede volver a mostrarlos", () => {
    const p = retirados[0];
    const con = applyOverrides([p], new Map([[p.id, { productId: p.id, priceMinor: 100, priceUsdMinor: 1000, priceArsMinor: null, title: null, description: null, orderOnly: false, stockQuantity: 3, maxPerOrder: null, visible: true, updatedAt: 1, updatedByEmail: "d@e.com" }]]));
    expect(con[0].active).toBe(false);
  });
  it("las colecciones que se quedaron sin productos publicados dejan de listarse; las demás siguen", () => {
    const conProductos = new Set(zhPub.flatMap((p) => p.expansionIds));
    const sinProductos = zhExp.filter((e) => !conProductos.has(e.id)).map((e) => e.id);
    expect(sinProductos).toEqual(["zh-qiji-qicheng"]);
  });
});

describe("catálogo chino: cajas con cantidades confirmadas o pendientes, sin contradicciones", () => {
  const caja = (id: string) => zh.find((p) => p.id === id)!;
  it("宝石包 VOL.6: la ficha del proveedor confirma 18 sobres de 4 cartas por caja, y ningún texto sigue dudando si es caja o sobre", () => {
    const p = caja("zh-baoshibao-vol6-caja");
    expect(p.title).toBe("Gem Pack Vol. 6 · Caja de 18 sobres");
    expect(p.contents[0]).toMatchObject({ label: "Sobres por caja", quantity: 18 });
    expect(p.contents[1]).toMatchObject({ label: "Cartas por sobre", quantity: 4 });
    expect(p.description + p.contents.map((c) => c.note ?? "").join(" ")).not.toMatch(/se confirma con el proveedor|盲盒|unidad de venta/);
    expect(p.description).toContain("每盒18包");
  });
  it("las cajas sin cantidad de sobres legible siguen diciendo «dato pendiente» en la ficha y en el contenido, sin números inventados", () => {
    for (const id of ["zh-shengxiang-xingyin-caja", "zh-anying-duohui-caja", "zh-taijing-shengju-caja"]) {
      const p = caja(id);
      const sobres = p.contents.find((c) => c.label === "Sobres por caja")!;
      expect(sobres.quantity, id).toBeUndefined();
      expect(sobres.note, id).toMatch(/pendiente/i);
      expect(p.description, id).toMatch(/pendiente de confirmar/);
    }
  });
  it("Terastal Gathering: la caja y el sobre de 10 cartas son fichas distintas y la caja conserva su limitación de unidad de venta", () => {
    expect(caja("zh-taijing-shengju-caja").description).toMatch(/unidad de venta final se confirma/);
    expect(caja("zh-taijing-shengju-caja").images.map((i) => i.view)).toEqual(["closed", "detail", "detail"]);
  });
});
