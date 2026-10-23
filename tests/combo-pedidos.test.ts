import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { demoCatalog } from "@/content/catalog";
import { SLEEVES_ID, TOPLOADERS_ID } from "@/content/real/accesorios";
import { inquiries, inquiryLines, productAudit, saleLines, stockMovements } from "@/db/schema";
import { createInquiry, hashToken, InquiryError } from "@/features/inquiries/service";
import { applyOverrides, loadOverrides, saveProductChange } from "@/features/catalog/overrides";
import { getInquiryDetail } from "@/features/consultas/service";
import { PromoError, getComboConfig, saveComboConfig } from "@/features/promos/settings";
import type { ComboConfig } from "@/features/promos/combo";
import { registerSale, voidSale } from "@/features/sales/service";
import type { EffectiveRate } from "@/features/fx/convert";
import { openTestDb, type TestDb } from "./helpers/pg";

/**
 * Promoción caja + sobres y accesorios de punta a punta, con PostgreSQL real: consulta guardada (moneda base, descuentos por línea), mensaje, conversión en venta sin
 * volver a descontar, stock por pack, anulación, configuración del panel con historial y precios fijos en pesos que no dependen de la cotización.
 */
const base = demoCatalog.products;
const actor = { id: "admin-1", email: "dueno@example.com" };
const owner = { sessionTokenHash: hashToken("sesion-a") };
const FX: EffectiveRate = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false };
const FX_CAIDA: EffectiveRate = { status: "none", mode: "auto", rate10k: null, asOf: null, providerUpdatedAt: null, source: "sin datos", warn: true };
const CFG: ComboConfig = { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre"] };
const retiro = { method: "retiro" } as const;
let n = 0;
const key = () => `pedido-de-prueba-${String(++n).padStart(8, "0")}`;
let db: TestDb;
beforeEach(async () => {
  db = await openTestDb({ max: 6 });
  n = 0;
});

const inq = (items: Array<{ productId: string; quantity: number; mode?: "buy" | "encargo" }>, over: Record<string, unknown> = {}, ctx: { combo?: ComboConfig; fx?: EffectiveRate } = {}) =>
  createInquiry(db, { items, delivery: retiro, payment: "efectivo", contactName: "Inés Muñoz", idempotencyKey: key(), ...over }, { sessionTokenHash: owner.sessionTokenHash, fx: FX, combo: CFG, ...ctx });
const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof InquiryError) return e.info; throw e; } throw new Error("se esperaba un error"); };
const stockOf = async (id: string) => applyOverrides(base, await loadOverrides(db)).find((p) => p.id === id)!.stockQuantity;

describe("la consulta guarda moneda base, precios y el detalle del descuento", () => {
  it("1 caja + 7 sobres (5 cupos): combo en los 5 de mayor precio; subtotal − combo = total; el mensaje lo detalla", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 4 }, { productId: "ejemplo-sobre", quantity: 3 }]);
    // ejemplo-sobre $12.500 (3 unidades) y storm-sobre $9.500 (4 unidades): los 3 caros + 2 de los baratos
    const c = inquiry.lines.find((l) => l.productId === "ejemplo-sobre")!;
    const s = inquiry.lines.find((l) => l.productId === "storm-sobre")!;
    expect(c).toMatchObject({ comboUnits: 3, comboDiscountMinor: 3 * 125000, transferDiscountMinor: 0, baseCurrency: "ARS" });
    expect(s).toMatchObject({ comboUnits: 2, comboDiscountMinor: 2 * 95000 });
    expect(inquiry.comboDiscountMinor).toBe(3 * 125000 + 2 * 95000);
    expect(inquiry.discountMinor).toBe(0);
    expect(inquiry.subtotalMinor).toBe(18500000 + 3 * 1250000 + 4 * 950000);
    expect(inquiry.message).toContain("Descuento combo caja + sobres: -$ 5.650");
    expect(inquiry.message).toContain("combo caja + sobres: 10% OFF en 3 sobres (-$ 3.750)");
    expect(inquiry.message).toContain(`*Total: $ ${((inquiry.subtotalMinor - inquiry.comboDiscountMinor) / 100).toLocaleString("es-AR")}*`);
    // lo guardado en la base coincide con lo que se mostró
    const [row] = await db.select().from(inquiries).where(eq(inquiries.id, inquiry.reference));
    expect(row.comboDiscountMinor).toBe(inquiry.comboDiscountMinor);
    const lines = await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, inquiry.reference));
    expect(lines.reduce((t, l) => t + l.comboDiscountMinor, 0)).toBe(row.comboDiscountMinor);
  });
  it("transferencia: sin doble descuento (los 10% no se suman) y el total coincide con la suma de las líneas", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 5 }], { payment: "transferencia" });
    expect(inquiry.comboDiscountMinor).toBe(0);
    expect(inquiry.discountMinor).toBe(1850000 + 5 * 95000);
    expect(inquiry.lines.reduce((t, l) => t + (l.lineSubtotalMinor ?? 0) - l.comboDiscountMinor - l.transferDiscountMinor, 0)).toBe(inquiry.subtotalMinor - inquiry.discountMinor - inquiry.comboDiscountMinor);
  });
  it("cuotas: rige el combo y no hay descuento de transferencia", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], { payment: "tarjeta-3-cuotas" });
    expect(inquiry.discountMinor).toBe(0);
    expect(inquiry.comboDiscountMinor).toBe(2 * 95000);
  });
  it("combo apagado: ningún descuento y los importes son los de siempre", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 5 }], {}, { combo: { ...CFG, enabled: false } });
    expect(inquiry.comboDiscountMinor).toBe(0);
    expect(inquiry.subtotalMinor).toBe(18500000 + 5 * 950000);
  });
  it("sin una caja participante, o con sobres que no participan, no hay descuento", async () => {
    expect((await inq([{ productId: "ejemplo-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }])).inquiry.comboDiscountMinor).toBe(0); // la caja no participa
    expect((await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "parcial-sobre", quantity: 2 }])).inquiry.comboDiscountMinor).toBe(0); // el sobre no participa
  });
});

describe("el servidor es la autoridad: nada que mande el navegador cambia un importe", () => {
  it("campos de precio o descuento enviados por el cliente se ignoran", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 1 }], { comboDiscountMinor: 99999999, discountMinor: 99999999, subtotalMinor: 1, totalMinor: 1, unitPriceMinor: 1 });
    expect(inquiry.comboDiscountMinor).toBe(95000);
    expect(inquiry.discountMinor).toBe(0);
    expect(inquiry.subtotalMinor).toBe(18500000 + 950000);
  });
  it("un precio esperado distinto solo avisa; el total esperado que ya no coincide se informa y se puede revisar", async () => {
    const items = [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }];
    const e = await err(inq(items, { expectedTotalMinor: 1 }));
    expect(e).toMatchObject({ status: 409, code: "price_changed" });
    expect((e.details as Array<{ totalMinor: number }>)[0].totalMinor).toBe(18500000 + 2 * 950000 - 2 * 95000);
    // con el total correcto se guarda
    const ok = await inq(items, { expectedTotalMinor: 18500000 + 2 * 950000 - 2 * 95000 });
    expect(ok.replayed).toBe(false);
    // si cambia la elegibilidad (se apaga el combo) antes de confirmar, avisa en vez de guardar otro importe
    const cambio = await err(inq(items, { expectedTotalMinor: 18500000 + 2 * 950000 - 2 * 95000 }, { combo: { ...CFG, enabled: false } }));
    expect(cambio.code).toBe("price_changed");
  });
  it("cambios de stock antes de confirmar: sin stock o por encima de lo disponible se rechaza", async () => {
    // (en el catálogo de prueba, guardar stock fija el precio ARS como pendiente: el stock 0 se simula en la vista del catálogo)
    const sinStock = base.map((p) => (p.id === "storm-caja" ? { ...p, stockQuantity: 0 } : p));
    const e = await createInquiry(db, { items: [{ productId: "storm-caja", quantity: 1 }], delivery: retiro, payment: "efectivo", contactName: "Inés Muñoz", idempotencyKey: key() }, { sessionTokenHash: owner.sessionTokenHash, fx: FX, products: sinStock, combo: CFG }).catch((x) => x.info);
    expect(e.code).toBe("out_of_stock");
    const demasiado = await err(inq([{ productId: "storm-caja", quantity: 5 }]));
    expect(demasiado.code).toBe("over_limit");
  });
  it("el reintento con la misma clave devuelve la misma consulta; con otro contenido, error", async () => {
    const k = key();
    const a = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], { idempotencyKey: k });
    const b = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], { idempotencyKey: k });
    expect(b.replayed).toBe(true);
    expect(b.inquiry.reference).toBe(a.inquiry.reference);
    expect((await err(inq([{ productId: "storm-sobre", quantity: 1 }], { idempotencyKey: k }))).code).toBe("idempotency_conflict");
  });
});

describe("accesorios: precio fijo en pesos y stock por pack", () => {
  it("$1.000 y $3.500 aunque la cotización falle o cambie; sin USD y con «pack de 5» en el mensaje", async () => {
    const items = [{ productId: SLEEVES_ID, quantity: 2 }, { productId: TOPLOADERS_ID, quantity: 1 }];
    for (const fx of [FX, FX_CAIDA, { ...FX, rate10k: 99_990_000 }]) {
      const { inquiry } = await inq(items, {}, { fx });
      expect(inquiry.lines.map((l) => [l.unitPriceMinor, l.unitPriceUsdMinor, l.baseCurrency, l.packSize])).toEqual([[100000, null, "ARS", 5], [350000, null, "ARS", 5]]);
      expect(inquiry.subtotalMinor).toBe(2 * 100000 + 350000);
      expect(inquiry.fx).toBeNull(); // ninguna línea depende del dólar: no se guarda cotización
      expect(inquiry.message).toContain("2 × Sleeves transparentes · Pack de 5 unidades — SKU ACC-SLEEVES-TRANSP-X5");
      expect(inquiry.message).not.toMatch(/\[No aplica\]|USD|dólar/i);
    }
  });
  it("los productos en dólares siguen igual: sin cotización quedan pendientes, los accesorios no", async () => {
    const products = applyOverrides(base, new Map(), FX_CAIDA);
    expect(products.find((p) => p.id === SLEEVES_ID)!.priceMinor).toBe(100000);
    expect(products.find((p) => p.id === "storm-sobre")!.priceMinor).toBe(950000); // demo: precio ARS fijo de ejemplo (sin USD)
  });
  it("no reciben el combo ni el 10% por transferencia, y no habilitan las promociones de pago", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }, { productId: SLEEVES_ID, quantity: 3 }], { payment: "transferencia" });
    const s = inquiry.lines.find((l) => l.productId === SLEEVES_ID)!;
    expect(s).toMatchObject({ comboDiscountMinor: 0, transferDiscountMinor: 0 });
    expect((await err(inq([{ productId: SLEEVES_ID, quantity: 1 }], { payment: "transferencia" }))).code).toBe("promo_not_eligible");
  });
  it("el dueño edita el precio fijo en pesos (con historial) y no puede mezclar monedas", async () => {
    await saveProductChange(db, base, SLEEVES_ID, { priceArsMinor: 120000, stock: 7, expectedVersion: 0 }, actor);
    const p = applyOverrides(base, await loadOverrides(db), FX_CAIDA).find((x) => x.id === SLEEVES_ID)!;
    expect(p).toMatchObject({ priceMinor: 120000, priceUsdMinor: null, stockQuantity: 7 });
    const hist = (await db.select().from(productAudit).where(eq(productAudit.productId, SLEEVES_ID))).map((a) => `${a.field}:${a.oldValue}->${a.newValue}`).sort();
    expect(hist).toEqual(["price_ars_minor:null->120000", "stock_quantity:20->7"]);
    const v = (await loadOverrides(db)).get(SLEEVES_ID)!.updatedAt;
    await expect(saveProductChange(db, base, SLEEVES_ID, { priceUsdMinor: 1000, expectedVersion: v }, actor)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(saveProductChange(db, base, "storm-sobre", { priceArsMinor: 100000, expectedVersion: 0 }, actor)).rejects.toMatchObject({ code: "invalid_input" });
    for (const bad of [50, 100050, -100, 150_000_000]) await expect(saveProductChange(db, base, SLEEVES_ID, { priceArsMinor: bad, expectedVersion: v }, actor)).rejects.toThrow();
    // una edición de stock que no manda precio conserva el fijo
    await saveProductChange(db, base, SLEEVES_ID, { stock: 9, expectedVersion: v }, actor);
    expect(applyOverrides(base, await loadOverrides(db), FX_CAIDA).find((x) => x.id === SLEEVES_ID)!.priceMinor).toBe(120000);
  });
  it("sin stock cargado (0 o pendiente) no se pueden comprar; comprar una unidad es comprar un pack y descuenta un pack", async () => {
    const sinStock = base.map((p) => (p.id === TOPLOADERS_ID ? { ...p, stockQuantity: 0 } : p));
    expect((await createInquiry(db, { items: [{ productId: TOPLOADERS_ID, quantity: 1 }], delivery: retiro, payment: "efectivo", contactName: "Inés Muñoz", idempotencyKey: key() }, { sessionTokenHash: owner.sessionTokenHash, fx: FX, products: sinStock }).catch((e) => e.info.code))).toBe("out_of_stock");
    const antes = (await stockOf(SLEEVES_ID))!;
    const { sale } = await registerSale(db, { items: [{ productId: SLEEVES_ID, quantity: 2, unitPriceMinor: 100000 }], paymentMethod: "efectivo", idempotencyKey: key() }, actor, { fx: FX });
    expect(await stockOf(SLEEVES_ID)).toBe(antes - 2); // 2 packs, no 10 unidades
    expect(sale.lines[0]).toMatchObject({ quantity: 2, packSize: 5, baseCurrency: "ARS", discountMinor: 0 });
    await voidSale(db, sale.id, "Error de carga", actor);
    expect(await stockOf(SLEEVES_ID)).toBe(antes);
    expect((await db.select().from(stockMovements)).map((m) => m.delta).sort()).toEqual([-2, 2]);
  });
});

describe("consulta → venta: el descuento no se vuelve a aplicar y los importes históricos no cambian", () => {
  it("la venta conserva lista, descuento por línea y total de la consulta; una configuración posterior no cambia nada", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 5 }, { productId: SLEEVES_ID, quantity: 1 }]);
    const total = inquiry.subtotalMinor - inquiry.discountMinor - inquiry.comboDiscountMinor;
    // el dueño apaga el combo ANTES de convertir: la venta sigue con lo que se cotizó
    await saveComboConfig(db, { enabled: false, boxIds: [], boosterIds: [], expectedVersion: 0 }, actor).catch(() => undefined);
    const items = (await getInquiryDetail(db, inquiry.reference))!.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPriceMinor: l.unitPriceMinor, discountMinor: l.comboDiscountMinor + l.transferDiscountMinor }));
    const { sale } = await registerSale(db, { items, paymentMethod: "efectivo", inquiryId: inquiry.reference, idempotencyKey: key() }, actor, { fx: FX });
    expect(sale.totalMinor).toBe(total);
    expect(sale.lines.find((l) => l.productId === "storm-sobre")).toMatchObject({ unitPriceMinor: 950000, discountMinor: 5 * 95000, discountKind: "combo", lineTotalMinor: 5 * 950000 - 5 * 95000 });
    expect(sale.lines.find((l) => l.productId === SLEEVES_ID)).toMatchObject({ discountMinor: 0, discountKind: null, packSize: 5 });
    // la consulta original conserva sus importes
    const d = (await getInquiryDetail(db, inquiry.reference))!;
    expect(d.inquiry.comboDiscountMinor).toBe(inquiry.comboDiscountMinor);
    expect(d.lines.find((l) => l.productId === "storm-sobre")).toMatchObject({ comboUnits: 5, comboDiscountMinor: 5 * 95000, baseCurrency: "ARS" });
  });
  it("un descuento editado a mano se marca «manual»; no puede superar el importe de la línea", async () => {
    const { inquiry } = await inq([{ productId: "storm-sobre", quantity: 2 }]);
    const { sale } = await registerSale(db, { items: [{ productId: "storm-sobre", quantity: 2, unitPriceMinor: 950000, discountMinor: 100000 }], paymentMethod: "efectivo", inquiryId: inquiry.reference, idempotencyKey: key() }, actor, { fx: FX });
    expect(sale.lines[0]).toMatchObject({ discountKind: "manual", lineTotalMinor: 1800000 });
    await expect(registerSale(db, { items: [{ productId: "ejemplo-sobre", quantity: 1, unitPriceMinor: 100000, discountMinor: 200000 }], paymentMethod: "efectivo", idempotencyKey: key() }, actor, { fx: FX })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await db.select().from(saleLines)).toHaveLength(1);
  });
  it("las consultas anteriores al combo (sin columnas nuevas) se siguen leyendo con sus importes originales", async () => {
    const { inquiry } = await inq([{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 1 }], {}, { combo: { enabled: false, boxIds: [], boosterIds: [] } });
    // se simula una fila vieja: las columnas nuevas quedan en sus valores por defecto
    await db.$client`update inquiries set combo_discount_minor = 0 where id = ${inquiry.reference}`;
    await db.$client`update inquiry_lines set base_currency = null, combo_units = 0, combo_discount_minor = 0, transfer_discount_minor = 0, pack_size = null where inquiry_id = ${inquiry.reference}`;
    const d = (await getInquiryDetail(db, inquiry.reference))!;
    expect(d.inquiry).toMatchObject({ subtotalMinor: 18500000 + 950000, discountMinor: 0, comboDiscountMinor: 0 });
    expect(d.lines.every((l) => l.baseCurrency === null && l.comboDiscountMinor === 0)).toBe(true);
  });
});

describe("configuración de la promoción en el panel", () => {
  it("sin configurar está apagada y vacía (no hay selección por defecto)", async () => {
    expect(await getComboConfig(db)).toMatchObject({ config: { enabled: false, boxIds: [], boosterIds: [] }, custom: false });
  });
  it("guarda con historial (quién, cuándo, antes y después), valida contra el catálogo y detecta ediciones simultáneas", async () => {
    const a = await saveComboConfig(db, { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre"], expectedVersion: 0 }, actor);
    expect(a.config).toEqual({ enabled: true, boxIds: ["storm-caja"], boosterIds: ["ejemplo-sobre", "storm-sobre"] });
    const hist = await db.select().from(productAudit).where(eq(productAudit.field, "promo_combo"));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ userEmail: actor.email, productId: "promo-combo" });
    expect(JSON.parse(hist[0].oldValue)).toEqual({ enabled: false, boxIds: [], boosterIds: [] });
    // sin cambios no escribe nada
    await saveComboConfig(db, { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre", "ejemplo-sobre"], expectedVersion: a.updatedAt }, actor);
    expect(await db.select().from(productAudit).where(eq(productAudit.field, "promo_combo"))).toHaveLength(1);
    // versión vieja → rechazo
    await expect(saveComboConfig(db, { enabled: false, boxIds: [], boosterIds: [], expectedVersion: 0 }, actor)).rejects.toMatchObject({ code: "stale" });
    // validaciones
    const bad = (over: object) => saveComboConfig(db, { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre"], expectedVersion: a.updatedAt, ...over }, actor);
    await expect(bad({ boxIds: ["storm-sobre"] })).rejects.toBeInstanceOf(PromoError); // un sobre no es una caja
    await expect(bad({ boosterIds: ["storm-caja"] })).rejects.toBeInstanceOf(PromoError);
    await expect(bad({ boosterIds: [SLEEVES_ID] })).rejects.toBeInstanceOf(PromoError); // un accesorio no es un sobre
    await expect(bad({ boxIds: ["no-existe"] })).rejects.toBeInstanceOf(PromoError);
    await expect(bad({ boxIds: [] })).rejects.toBeInstanceOf(PromoError); // activada sin cajas
    await expect(bad({ enabled: "si" })).rejects.toBeInstanceOf(PromoError);
  });
  it("la configuración guardada es la que usa la consulta (sin pasar nada a mano) y no modifica ningún precio", async () => {
    const antes = applyOverrides(base, await loadOverrides(db), FX).map((p) => [p.id, p.priceMinor]);
    await saveComboConfig(db, { enabled: true, boxIds: ["storm-caja"], boosterIds: ["storm-sobre"], expectedVersion: 0 }, actor);
    const { inquiry } = await createInquiry(db, { items: [{ productId: "storm-caja", quantity: 1 }, { productId: "storm-sobre", quantity: 2 }], delivery: retiro, payment: "efectivo", contactName: "Inés Muñoz", idempotencyKey: key() }, { sessionTokenHash: owner.sessionTokenHash, fx: FX });
    expect(inquiry.comboDiscountMinor).toBe(2 * 95000);
    expect(applyOverrides(base, await loadOverrides(db), FX).map((p) => [p.id, p.priceMinor])).toEqual(antes);
  });
});
