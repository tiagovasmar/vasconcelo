import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { realCatalog } from "@/content/catalog";
import { products as figures } from "@/content/real/china-figures";
import { products as balls } from "@/content/real/china-pikachu-balls";
import recortes from "@/content/colecciones/imagenes-recortes.json";
import { aleatoriedad, conRarezas, tituloGarantia } from "@/features/catalog/garantias";
import { validateCatalog } from "@/features/catalog/validate";

const { guarantees, sources } = realCatalog;
const products = realCatalog.products.filter((product) => (product.game ?? "pokemon") === "pokemon");
const anniversarySets = products.filter((p) => p.rarityReview?.sourceIds.includes("zh-30th-sets-oficial"));
const slim = (id: string) => id.startsWith("zh-151-") || ["zh-black-bolt-slim-caja", "zh-white-flare-slim-caja"].includes(id);
const withoutRarityReview = new Set(["zh-30-zhounian-caja", ...[...figures, ...balls].map((p) => p.id)]);
const pub = (p: string) => path.join(process.cwd(), "public", p.replace(/^\//, ""));

describe("qué garantiza cada caja (contenido físico / rarezas documentadas / observada)", () => {
  it("el encabezado «Qué garantiza…» es solo de cajas, cajas especiales y kits; los sobres sueltos no lo llevan", () => {
    expect(Object.keys(tituloGarantia).sort()).toEqual(["box", "kit", "special-box"]);
    for (const p of products) expect(conRarezas(p), p.id).toBe(["box", "special-box", "kit"].includes(p.kind));
    expect(tituloGarantia.box).toBe("Qué garantiza esta caja");
  });

  it("cada caja, caja especial y kit trae su revisión de rarezas con fuentes que existen; los sobres no", () => {
    const aplicables = products.filter((p) => !withoutRarityReview.has(p.id) && !slim(p.id) && ["box", "special-box", "kit"].includes(p.kind));
    expect(aplicables).toHaveLength(8 + 6 + 4 + 2 + 3 + 5); // incluye los cinco kits y cajas especiales del aniversario
    for (const p of aplicables) {
      expect(p.rarityReview, p.id).toBeDefined();
      expect(p.rarityReview!.status).toBe("not_documented");
      expect(p.rarityReview!.note.length).toBeGreaterThan(40);
      for (const s of p.rarityReview!.sourceIds) expect(sources.some((x) => x.id === s), `${p.id} → ${s}`).toBe(true);
    }
    for (const p of products.filter((x) => !aplicables.includes(x))) expect(p.rarityReview, p.id).toBeUndefined();
  });

  it("no hay ninguna garantía de rareza cargada (ninguna fuente revisada la documenta) y ninguna cifra de AR por caja", () => {
    expect(guarantees.filter((g) => g.type === "rarity")).toEqual([]);
    const texto = JSON.stringify([products.map((p) => p.rarityReview), guarantees.map((g) => g.statement)]);
    expect(texto).not.toMatch(/\d+ AR por caja|AR garantizad|garantiza[n]? \d+ AR/);
  });

  it("las cajas japonesas citan la ficha de la caja y la página oficial de la expansión; las chinas, la publicación del proveedor", () => {
    for (const p of products.filter((x) => x.kind === "box" && x.language === "ja" && x.rarityReview!.sourceIds[0].startsWith("box-"))) {
      expect(p.rarityReview!.sourceIds, p.id).toEqual([`box-${p.expansionIds[0]}`, `exp-${p.expansionIds[0]}`]);
      expect(p.rarityReview!.note).toMatch(/Pokémon Center Online/);
    }
    for (const p of products.filter((x) => ["box", "special-box", "kit"].includes(x.kind) && x.language === "zh" && !slim(x.id) && !withoutRarityReview.has(x.id) && !anniversarySets.includes(x))) {
      expect(p.rarityReview!.sourceIds, p.id).toHaveLength(1);
      expect(p.rarityReview!.sourceIds[0]).toMatch(/^zh-src-/);
      expect(p.rarityReview!.note).toMatch(/no declara rarezas garantizadas/);
      expect(p.rarityReview!.note).toMatch(/ni se trasladó ninguna garantía japonesa/);
    }
  });

  it("los cinco sets del aniversario documentan el contenido fijo y los sobres aleatorios", () => {
    expect(anniversarySets).toHaveLength(5);
    for (const p of anniversarySets) {
      expect(p.rarityReview?.note).toMatch(/contenido fijo.*aleatorias/);
      expect(p.contents).toContainEqual(expect.objectContaining({ label: "Sobres del 30.º aniversario", unit: "sobres" }));
    }
  });

  it("cada cantidad indica cómo leerla: MEGA Dream ex es una de dos alternativas; el resto, cantidad fija", () => {
    for (const k of ["caja", "sobre"]) {
      const mega = guarantees.find((g) => g.id === `g-mega-dream-ex-${k}-1-ex`)!;
      expect(mega.quantityKind, k).toBe("alternatives");
      expect(mega.statement).toMatch(/no se suman/);
    }
    for (const g of guarantees.filter((x) => x.type === "composition" && !x.id.includes("mega-dream-ex"))) expect(g.quantityKind, g.id).toBe("fixed");
    for (const g of guarantees.filter((x) => x.type === "physical_contents")) expect(g.quantityKind, g.id).toBe("fixed");
  });

  it("dos cartas brillantes no se presentan como dos AR (Black Bolt / White Flare)", () => {
    for (const id of ["black-bolt", "white-flare"]) {
      const g = guarantees.find((x) => x.id === `g-${id}-caja-2-brillantes`)!;
      expect(g.statement).toMatch(/2 cartas con acabado brillante/);
      expect(g.statement).toMatch(/no equivalen a dos AR ni a una cantidad de AR por caja/);
    }
  });

  it("las cajas especiales de Ogerpon documentan la composición del sobre «北上乡专题包» sin transcribir la tabla de probabilidades", () => {
    const ogerpon = products.filter((p) => p.kind === "special-box" && p.contents.some((item) => item.label.includes("北上乡专题包")));
    expect(ogerpon).toHaveLength(2);
    for (const p of ogerpon) {
      const c = p.contents.find((x) => x.label.includes("北上乡专题包"))!;
      expect(c.note).toMatch(/3 de Pokémon, 1 Pokémon ex fija y 1 de Entrenador/);
    }
    expect(realCatalog.pullRates.filter((r) => r.language === "zh")).toEqual([]);
  });

  it("qué es aleatorio se limita a lo documentado: el mazo y los accesorios de un kit son fijos", () => {
    expect(aleatoriedad({ kind: "kit" })).toMatch(/mazo, los accesorios y las guías son fijos/);
    expect(aleatoriedad({ kind: "kit" })).not.toMatch(/^El contenido es aleatorio/);
    expect(aleatoriedad({ kind: "booster" })).toMatch(/cartas de cada sobre son aleatorias/);
    expect(aleatoriedad({ kind: "illustration-set" })).toMatch(/marco y el sobre son fijos/);
  });

  it("el catálogo completo sigue validando y una revisión en un sobre suelto sería un error", () => {
    expect(validateCatalog(realCatalog, (p) => fs.existsSync(pub(p))).filter((i) => i.level === "error")).toEqual([]);
    const sobre = products.find((p) => p.kind === "booster")!;
    const roto = { ...realCatalog, products: realCatalog.products.map((p) => (p.id === sobre.id ? { ...p, rarityReview: products.find((x) => x.kind === "box")!.rarityReview } : p)) };
    expect(validateCatalog(roto, () => true).some((i) => i.level === "error" && /sobres sueltos/.test(i.message))).toBe(true);
  });
});

describe("cajas de White Flare y Black Bolt: sin fondo blanco (separadas por geometría)", () => {
  const afectadas = recortes.filter((r) => ["white-flare", "black-bolt"].includes(r.collectionId) && r.role.startsWith("caja"));
  it("son 4 derivados con transparencia real y nombre nuevo; los originales siguen intactos", () => {
    expect(afectadas).toHaveLength(4);
    for (const r of afectadas) {
      expect(r.hasAlpha, r.src).toBe(true);
      expect(r.src).toMatch(/-sin-fondo\.webp$/);
      expect(r.operacion).toMatch(/separado por geometría/);
      expect(fs.existsSync(pub(r.original)), r.original).toBe(true);
      expect(fs.existsSync(pub(r.src.replace("-sin-fondo", "-limpio"))), "no queda la versión con fondo blanco").toBe(false);
    }
  });

  it("las cuatro esquinas del recorte son transparentes, el interior es opaco (arte blanco conservado) y no hay halo blanco en el borde", async () => {
    for (const r of afectadas) {
      const { data, info } = await sharp(pub(r.src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width: w, height: h } = info;
      const a = (x: number, y: number) => data[(y * w + x) * 4 + 3];
      for (const [x, y] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) expect(a(x, y), `${r.src} esquina ${x},${y}`).toBe(0);
      // zona central: todo opaco (incluye el arte blanco del envase)
      let opacos = 0, total = 0;
      for (let y = Math.round(h * 0.35); y < Math.round(h * 0.65); y += 3) for (let x = Math.round(w * 0.35); x < Math.round(w * 0.65); x += 3) { total++; if (a(x, y) === 255) opacos++; }
      expect(opacos / total, r.src).toBeGreaterThan(0.995);
      // borde nítido: la transición opaco→transparente es de ~1–2 px (sin una franja difusa que se vea como contorno claro sobre el verde del banner)
      let borde = 0;
      for (let i = 0; i < w * h; i++) { const al = data[i * 4 + 3]; if (al > 0 && al < 255) borde++; }
      expect(borde / (w * h), `${r.src} borde difuso`).toBeLessThan(0.006);
    }
  });

  it("el catálogo, los banners y las fichas usan el derivado sin fondo (sin «opaque»)", () => {
    for (const id of ["white-flare-caja", "black-bolt-caja"]) {
      const p = products.find((x) => x.id === id)!;
      for (const img of p.images) {
        expect(img.src, `${id} ${img.view}`).toMatch(/-sin-fondo\.webp$/);
        expect(img.opaque).toBe(false);
      }
      expect(p.images[0].view).toBe("closed");
      expect(p.images.some((i) => i.view === "display-open")).toBe(true);
    }
  });
});
