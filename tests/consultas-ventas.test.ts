import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { demoCatalog } from "@/content/catalog";
import { inquiries, inquiryEvents, inquirySales, productAudit, saleLines, sales, stockMovements } from "@/db/schema";
import { applyInquiryAction, getInquiryDetail, inquiryMetrics, listInquiries, listLinkableSales } from "@/features/consultas/service";
import { createInquiry, hashToken } from "@/features/inquiries/service";
import { loadOverrides } from "@/features/catalog/overrides";
import { linkSaleToInquiry, listSales, previewSale, registerSale, SaleError, voidSale } from "@/features/sales/service";
import type { EffectiveRate } from "@/features/fx/convert";
import { openTestDb, type TestDb } from "./helpers/pg";

/**
 * Convertir una consulta en venta, vincular una venta existente, anular y volver a convertir, sobre PostgreSQL real con pedidos simultáneos de verdad (6 conexiones).
 * La venta, el descuento de stock y el vínculo con la consulta son UNA transacción; el sistema de ventas es el existente (`sales/service.ts`).
 * Catálogo de prueba: storm-sobre (stock 24), storm-caja (3), storm-pack5 (6), parcial-bundle (0), ejemplo-sobre (40).
 */
const base = demoCatalog.products;
const actor = { id: "admin-1", email: "dueno@example.com" };
const FX: EffectiveRate = { status: "manual", mode: "manual", rate10k: 12_340_000, asOf: 1, providerUpdatedAt: null, source: "prueba", warn: false };
const owner = { sessionTokenHash: hashToken("sesion-a") };
let n = 0;
const key = () => `venta-de-prueba-${String(++n).padStart(8, "0")}`;
let db: TestDb;
beforeEach(async () => {
  db = await openTestDb({ max: 6 });
  n = 0;
});

const peso = (p: number) => p * 100;
const stockOf = async (id: string) => (await loadOverrides(db)).get(id)?.stockQuantity ?? base.find((p) => p.id === id)!.stockQuantity;
const newInquiry = async (over: Record<string, unknown> = {}) => {
  const { inquiry } = await createInquiry(db, { items: [{ productId: "storm-sobre", quantity: 2 }, { productId: "storm-caja", quantity: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Inés Muñoz", contactPhone: "11 5555-0000", idempotencyKey: key(), ...over }, owner);
  return inquiry.reference;
};
const body = (items: Array<{ productId: string; quantity: number; price: number }>, over: Record<string, unknown> = {}) => ({
  items: items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPriceMinor: peso(i.price) })), paymentMethod: "efectivo", idempotencyKey: key(), ...over,
});
const reg = (b: unknown) => registerSale(db, b, actor, { fx: FX });
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
const activeLinks = async () => (await db.select().from(inquirySales)).filter((l) => l.active);
const counts = async () => ({ sales: (await db.select().from(sales)).length, lines: (await db.select().from(saleLines)).length, moves: (await db.select().from(stockMovements)).length, links: (await db.select().from(inquirySales)).length });

describe("convertir en venta", () => {
  it("guarda la venta, el descuento de stock y el vínculo juntos; descuenta SOLO lo vendido; la consulta queda convertida con el contacto confirmado y su original intacta", async () => {
    const id = await newInquiry(); // consulta: 2 sobres + 1 caja
    const sobre0 = (await stockOf("storm-sobre"))!;
    const caja0 = (await stockOf("storm-caja"))!;
    const { sale, replayed } = await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id })); // se vende menos de lo consultado
    expect(replayed).toBe(false);
    expect(sale).toMatchObject({ status: "registrada", totalMinor: peso(9000), inquiry: { id, name: "Inés Muñoz", kind: "convertida", active: true } });
    expect(await stockOf("storm-sobre")).toBe(sobre0 - 1);
    expect(await stockOf("storm-caja")).toBe(caja0); // no se vendió: intacta
    const mv = await db.select().from(stockMovements);
    expect(mv).toHaveLength(1);
    expect(mv[0]).toMatchObject({ kind: "venta", delta: -1, saleId: sale.id });
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry.crmStatus).toBe("convertida");
    expect(d.inquiry.contactConfirmedAt).not.toBeNull();
    expect(d.activeSale).toMatchObject({ id: sale.id, linkKind: "convertida" });
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["created", "contact_confirmed", "sale_created"]));
    expect(d.lines.find((l) => l.productId === "storm-sobre")).toMatchObject({ quantity: 2, unitPriceMinor: 950000 }); // la consulta original sigue igual
    expect((await db.select().from(productAudit)).filter((a) => a.field === "stock_quantity")).toHaveLength(1);
  });

  it("falta de stock: no queda venta, ni movimiento, ni vínculo; la consulta sigue pendiente", async () => {
    const id = await newInquiry();
    expect(await code(reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }, { productId: "storm-caja", quantity: 4, price: 18000 }], { inquiryId: id })))).toBe("insufficient_stock");
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0, links: 0 });
    expect((await getInquiryDetail(db, id))!.inquiry.crmStatus).toBe("pendiente");
    expect(await stockOf("storm-sobre")).toBe(24);
  });

  it("una consulta inexistente se rechaza y no deja nada", async () => {
    expect(await code(reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: "TT-NOEXISTE" })))).toBe("not_found");
    expect(await counts()).toEqual({ sales: 0, lines: 0, moves: 0, links: 0 });
    expect(await stockOf("storm-sobre")).toBe(24);
  });

  it("doble clic / reintento con la misma clave: una sola venta, un solo descuento, un solo vínculo", async () => {
    const id = await newInquiry();
    const b = body([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { inquiryId: id });
    const a = await reg(b);
    const c = await reg(b);
    expect(c.replayed).toBe(true);
    expect(c.sale.id).toBe(a.sale.id);
    expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1, links: 1 });
    expect(await stockOf("storm-sobre")).toBe(22);
  });

  it("clics simultáneos con la misma clave: una sola venta y un solo descuento", async () => {
    const id = await newInquiry();
    const b = body([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { inquiryId: id });
    const r = await Promise.all(Array.from({ length: 6 }, () => reg(b)));
    expect(new Set(r.map((x) => x.sale.id)).size).toBe(1);
    expect(r.filter((x) => !x.replayed)).toHaveLength(1);
    expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1, links: 1 });
    expect(await stockOf("storm-sobre")).toBe(22);
  });

  it("la misma clave con OTRA consulta se rechaza (no devuelve la venta de otra persona)", async () => {
    const a = await newInquiry();
    const b = await newInquiry();
    const k = key();
    await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: a, idempotencyKey: k }));
    expect(await code(reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: b, idempotencyKey: k })))).toBe("idempotency_conflict");
  });

  it("dos acciones simultáneas con claves distintas sobre la misma consulta: una gana, las otras reciben «ya convertida» y el stock baja una vez", async () => {
    const id = await newInquiry();
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => reg(body([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { inquiryId: id }))));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r.filter((x) => x.status === "rejected")) expect((x as PromiseRejectedResult).reason).toMatchObject({ code: "already_converted" });
    expect(await stockOf("storm-sobre")).toBe(22);
    expect(await counts()).toEqual({ sales: 1, lines: 1, moves: 1, links: 1 });
  });

  it("la vista previa avisa si la consulta ya tiene una venta vigente y no escribe nada", async () => {
    const id = await newInquiry();
    await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }));
    const antes = await counts();
    expect(await code(previewSale(db, body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id })))).toBe("already_converted");
    expect(await counts()).toEqual(antes);
  });

  it("dos consultas distintas compitiendo por el último stock: no se pasa del disponible", async () => {
    const ids = await Promise.all([newInquiry({ items: [{ productId: "storm-caja", quantity: 1 }] }), newInquiry({ items: [{ productId: "storm-caja", quantity: 1 }] }), newInquiry({ items: [{ productId: "storm-caja", quantity: 1 }] }), newInquiry({ items: [{ productId: "storm-caja", quantity: 1 }] })]);
    const r = await Promise.allSettled(ids.map((id) => reg(body([{ productId: "storm-caja", quantity: 1, price: 18000 }], { inquiryId: id })))); // hay 3
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(3);
    for (const x of r.filter((x) => x.status === "rejected")) expect((x as PromiseRejectedResult).reason).toMatchObject({ code: "insufficient_stock" });
    expect(await stockOf("storm-caja")).toBe(0);
    expect(await activeLinks()).toHaveLength(3);
    // la consulta rechazada quedó como estaba
    expect((await listInquiries(db, { status: "pendiente" })).rows).toHaveLength(1);
  });
});

describe("vincular una venta ya registrada", () => {
  it("no vuelve a descontar stock, deja el vínculo, convierte la consulta y es idempotente", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 2, price: 9000 }])); // venta suelta: 24 → 22
    expect((await getInquiryDetail(db, id))!.inquiry.crmStatus).toBe("pendiente");
    const antes = await counts();
    const r = await linkSaleToInquiry(db, sale.id, id, actor);
    expect(r).toMatchObject({ replayed: false, sale: { id: sale.id, inquiry: { id, kind: "vinculada", active: true } } });
    expect(await stockOf("storm-sobre")).toBe(22);
    expect(await counts()).toEqual({ ...antes, links: 1 }); // ni ventas, ni líneas, ni movimientos nuevos
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry.crmStatus).toBe("convertida");
    expect(d.events.map((e) => e.kind)).toContain("sale_linked");
    expect((await linkSaleToInquiry(db, sale.id, id, actor)).replayed).toBe(true);
    expect((await getInquiryDetail(db, id))!.events.filter((e) => e.kind === "sale_linked")).toHaveLength(1);
  });
  it("lista solo las ventas vigentes sin consulta", async () => {
    const id = await newInquiry();
    const a = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    const b = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    const c = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }))).sale;
    await voidSale(db, b.id, "Error de carga", actor);
    expect((await listLinkableSales(db)).map((s) => s.id)).toEqual([a.id]);
    expect(c.id).toBeTruthy();
  });
  it("no se vincula una venta ya vinculada, una anulada ni a una consulta que ya tiene una venta vigente", async () => {
    const a = await newInquiry();
    const b = await newInquiry();
    const s1 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: a }))).sale;
    const s2 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    expect(await code(linkSaleToInquiry(db, s1.id, b, actor))).toBe("already_linked");
    expect(await code(linkSaleToInquiry(db, s2.id, a, actor))).toBe("already_converted");
    await voidSale(db, s2.id, "Error de carga", actor);
    expect(await code(linkSaleToInquiry(db, s2.id, b, actor))).toBe("voided");
    expect(await code(linkSaleToInquiry(db, "VT-NOEXISTE", b, actor))).toBe("not_found");
    expect(await code(linkSaleToInquiry(db, s2.id, "TT-NOEXISTE", actor))).toBe("voided");
  });
  it("una venta anulada que estuvo vinculada no se puede volver a vincular a la misma consulta", async () => {
    const id = await newInquiry();
    const s = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }))).sale;
    await voidSale(db, s.id, "Se arrepintió", actor);
    expect(await code(linkSaleToInquiry(db, s.id, id, actor))).toBe("already_linked");
  });
  it("vinculaciones simultáneas de dos ventas a la misma consulta: solo una", async () => {
    const id = await newInquiry();
    const s1 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    const s2 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    const r = await Promise.allSettled([linkSaleToInquiry(db, s1.id, id, actor), linkSaleToInquiry(db, s2.id, id, actor)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await activeLinks()).toHaveLength(1);
  });
  it("vincular y anular la misma venta a la vez deja un estado coherente (sin vínculo vigente sobre una venta anulada)", async () => {
    for (let i = 0; i < 4; i++) {
      const id = await newInquiry();
      const s = (await reg(body([{ productId: "ejemplo-sobre", quantity: 1, price: 9000 }]))).sale;
      await Promise.allSettled([linkSaleToInquiry(db, s.id, id, actor), voidSale(db, s.id, "Error de carga", actor)]);
      const sale = (await db.select().from(sales).where(eq(sales.id, s.id)))[0];
      const links = (await db.select().from(inquirySales).where(eq(inquirySales.saleId, s.id)));
      expect(sale.status).toBe("anulada");
      expect(links.filter((l) => l.active)).toHaveLength(0);
      expect((await getInquiryDetail(db, id))!.inquiry.crmStatus).not.toBe("convertida");
    }
    expect(await stockOf("ejemplo-sobre")).toBe(40); // cada venta anulada devolvió lo suyo, una vez
  });
});

describe("anulación y nueva conversión", () => {
  it("anular devuelve el stock UNA vez, cierra el vínculo (queda como historia), la consulta vuelve a seguimiento y deja de contar", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 2, price: 9000 }, { productId: "storm-caja", quantity: 1, price: 18000 }], { inquiryId: id }));
    expect(await inquiryMetrics(db)).toMatchObject({ convertida: 1, salesCount: 1, revenueMinor: peso(36000) });
    const v = await voidSale(db, sale.id, "Se arrepintió", actor);
    expect(v).toMatchObject({ status: "anulada", voidReason: "Se arrepintió" });
    expect(await stockOf("storm-sobre")).toBe(24);
    expect(await stockOf("storm-caja")).toBe(3);
    const links = await db.select().from(inquirySales);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ saleId: sale.id, active: false, endedReason: "Se arrepintió" });
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry.crmStatus).toBe("en_seguimiento");
    expect(d.activeSale).toBeNull();
    expect(d.events.map((e) => e.kind)).toEqual(expect.arrayContaining(["sale_created", "sale_voided"]));
    const m = await inquiryMetrics(db);
    expect(m).toMatchObject({ convertida: 0, enSeguimiento: 1, salesCount: 0, revenueMinor: 0, voidedCount: 1 });
    expect(m.conversionGenerated).toBe(0);
  });

  it("anular dos veces, o muchas a la vez, devuelve el stock una sola vez", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 4, price: 9000 }], { inquiryId: id }));
    expect(await stockOf("storm-sobre")).toBe(20);
    const r = await Promise.allSettled(Array.from({ length: 6 }, () => voidSale(db, sale.id, "Error de carga", actor)));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    for (const x of r.filter((x) => x.status === "rejected")) expect((x as PromiseRejectedResult).reason).toMatchObject({ code: "already_voided" });
    expect(await stockOf("storm-sobre")).toBe(24);
    expect(await code(voidSale(db, sale.id, "Otra vez", actor))).toBe("already_voided");
    expect(await stockOf("storm-sobre")).toBe(24);
    expect((await db.select().from(stockMovements)).filter((m) => m.kind === "anulacion")).toHaveLength(1);
    expect((await getInquiryDetail(db, id))!.events.filter((e) => e.kind === "sale_voided")).toHaveLength(1);
  });

  it("reconversión: tras anular se puede convertir de nuevo con otra venta; el historial se conserva y nunca hay dos ventas vigentes ni devoluciones dobles", async () => {
    const id = await newInquiry();
    const first = (await reg(body([{ productId: "storm-sobre", quantity: 2, price: 9000 }], { inquiryId: id }))).sale;
    expect(await stockOf("storm-sobre")).toBe(22);
    // mientras la primera está vigente, no se puede convertir otra vez
    expect(await code(reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id })))).toBe("already_converted");
    await voidSale(db, first.id, "Pago rechazado", actor);
    expect(await stockOf("storm-sobre")).toBe(24);
    const second = (await reg(body([{ productId: "storm-sobre", quantity: 3, price: 9500 }], { inquiryId: id }))).sale;
    expect(second.id).not.toBe(first.id);
    expect(await stockOf("storm-sobre")).toBe(21);
    const links = await db.select().from(inquirySales).where(eq(inquirySales.inquiryId, id)).orderBy(inquirySales.id);
    expect(links.map((l) => [l.saleId, l.active])).toEqual([[first.id, false], [second.id, true]]);
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry.crmStatus).toBe("convertida");
    expect(d.activeSale?.id).toBe(second.id);
    expect(d.sales.map((s) => [s.id, s.status, s.linkActive])).toEqual(expect.arrayContaining([[first.id, "anulada", false], [second.id, "registrada", true]]));
    expect(d.events.map((e) => e.kind).filter((k) => k.startsWith("sale_")).reverse()).toEqual(["sale_created", "sale_voided", "sale_created"]);
    // la primera sigue anulada: anularla otra vez no devuelve nada ni toca la segunda
    expect(await code(voidSale(db, first.id, "Otra vez", actor))).toBe("already_voided");
    expect(await stockOf("storm-sobre")).toBe(21);
    // y la segunda también se puede anular y reconvertir
    await voidSale(db, second.id, "Otro cambio", actor);
    expect(await stockOf("storm-sobre")).toBe(24);
    expect(await activeLinks()).toHaveLength(0);
    const m = await inquiryMetrics(db);
    expect(m).toMatchObject({ convertida: 0, salesCount: 0, voidedCount: 2 });
  });

  it("anulación y nueva conversión simultáneas: como mucho una venta vigente y el stock siempre cuadra", async () => {
    // Las consultas se crean antes de la primera venta: en el catálogo de prueba, guardar stock de un producto fija su precio ARS como pendiente.
    const todas = [await newInquiry({ items: [{ productId: "ejemplo-sobre", quantity: 1 }] }), await newInquiry({ items: [{ productId: "ejemplo-sobre", quantity: 1 }] }), await newInquiry({ items: [{ productId: "ejemplo-sobre", quantity: 1 }] })];
    for (const id of todas) {
      const first = (await reg(body([{ productId: "ejemplo-sobre", quantity: 5, price: 9000 }], { inquiryId: id }))).sale;
      const r = await Promise.allSettled([voidSale(db, first.id, "Cambio de idea", actor), reg(body([{ productId: "ejemplo-sobre", quantity: 5, price: 9000 }], { inquiryId: id }))]);
      expect(r[0].status).toBe("fulfilled");
      const active = (await db.select().from(inquirySales).where(eq(inquirySales.inquiryId, id))).filter((l) => l.active);
      expect(active.length).toBeLessThanOrEqual(1);
      const vigentes = (await db.select().from(sales)).filter((s) => s.status === "registrada");
      // El stock = inicial − lo que descuentan las ventas vigentes (cada anulada devolvió lo suyo).
      const vendido = (await db.select().from(saleLines)).filter((l) => vigentes.some((s) => s.id === l.saleId)).reduce((t, l) => t + l.quantity, 0);
      expect(await stockOf("ejemplo-sobre")).toBe(40 - vendido);
      // limpiar para la siguiente vuelta
      for (const s of vigentes) await voidSale(db, s.id, "Limpieza de la prueba", actor);
      expect(await stockOf("ejemplo-sobre")).toBe(40);
    }
  });

  it("una venta suelta anulada no toca ninguna consulta", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]));
    await voidSale(db, sale.id, "Error de carga", actor);
    expect((await getInquiryDetail(db, id))!.inquiry.crmStatus).toBe("pendiente");
    expect(await db.select().from(inquirySales)).toHaveLength(0);
  });

  it("no se puede cambiar el estado de una consulta con venta vigente, pero sí después de anularla", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }));
    await expect(applyInquiryAction(db, id, { action: "set_status", status: "no_concretada" }, actor)).rejects.toMatchObject({ code: "converted" });
    await expect(applyInquiryAction(db, id, { action: "unconfirm_contact" }, actor)).rejects.toMatchObject({ code: "converted" });
    await voidSale(db, sale.id, "Se arrepintió", actor);
    await applyInquiryAction(db, id, { action: "set_status", status: "no_concretada", reason: "Se arrepintió" }, actor);
    expect((await getInquiryDetail(db, id))!.inquiry.crmStatus).toBe("no_concretada");
  });
});

describe("integridad en la base", () => {
  it("el vínculo no se borra ni se reescribe; solo se cierra una vez", async () => {
    const id = await newInquiry();
    const { sale } = await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }));
    await expect(db.$client`delete from inquiry_sales where sale_id = ${sale.id}`).rejects.toThrow(/no se borra/);
    await expect(db.$client`update inquiry_sales set kind = 'vinculada' where sale_id = ${sale.id}`).rejects.toThrow(/solo se puede cerrar/);
    await expect(db.$client`update inquiry_sales set active = false where sale_id = ${sale.id}`).rejects.toThrow(/solo se puede cerrar/); // sin fecha de cierre
    await voidSale(db, sale.id, "Se arrepintió", actor);
    await expect(db.$client`update inquiry_sales set active = true, ended_at = null where sale_id = ${sale.id}`).rejects.toThrow(/solo se puede cerrar/);
  });
  it("el índice único impide dos vínculos vigentes de una consulta y una venta en dos consultas", async () => {
    const a = await newInquiry();
    const b = await newInquiry();
    const s1 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    const s2 = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }]))).sale;
    await db.insert(inquirySales).values({ inquiryId: a, saleId: s1.id, kind: "vinculada", active: true, createdAt: 1, createdByEmail: "x@example.com" });
    await expect(db.insert(inquirySales).values({ inquiryId: a, saleId: s2.id, kind: "vinculada", active: true, createdAt: 2, createdByEmail: "x@example.com" })).rejects.toThrow();
    await expect(db.insert(inquirySales).values({ inquiryId: b, saleId: s1.id, kind: "vinculada", active: true, createdAt: 3, createdByEmail: "x@example.com" })).rejects.toThrow();
  });
  it("estados inválidos de la consulta se rechazan", async () => {
    const id = await newInquiry();
    await expect(db.$client`update inquiries set crm_status = 'otra_cosa' where id = ${id}`).rejects.toThrow();
  });
});

describe("métricas con ventas", () => {
  const ymd = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
  it("conversión sobre generadas y sobre contactos confirmados; identifica cliente y consulta de cada venta", async () => {
    const [a, b, c, d] = [await newInquiry(), await newInquiry({ contactName: "Pedro Gómez" }), await newInquiry(), await newInquiry()];
    await applyInquiryAction(db, b, { action: "confirm_contact" }, actor);
    await applyInquiryAction(db, c, { action: "set_status", status: "no_concretada", reason: "Caro" }, actor);
    await applyInquiryAction(db, d, { action: "set_status", status: "en_seguimiento" }, actor);
    await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: a })); // convierte y confirma contacto
    const m = await inquiryMetrics(db);
    expect(m).toMatchObject({ generated: 4, web: 4, contactConfirmed: 2, pendiente: 1, enSeguimiento: 1, noConcretada: 1, convertida: 1, salesCount: 1, salesWithoutInquiry: 0 });
    expect(m.conversionGenerated).toBeCloseTo(0.25);
    expect(m.conversionConfirmed).toBeCloseTo(0.5);
    expect((await listSales(db))[0].inquiry).toMatchObject({ id: a, name: "Inés Muñoz" });
    expect((await listInquiries(db, { q: a })).rows[0]).toMatchObject({ id: a, crmStatus: "convertida" });
  });
  it("ventas e ingresos por fecha de la venta, aparte de la conversión de las consultas creadas en el período; las ventas sueltas se informan", async () => {
    const dia = Date.parse("2026-10-10T15:00:00-03:00");
    const hoy = Date.now();
    const id = await newInquiry();
    await registerSale(db, body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }), actor, { fx: FX, now: hoy });
    await registerSale(db, body([{ productId: "storm-sobre", quantity: 1, price: 7000 }]), actor, { fx: FX, now: dia }); // suelta, de otra fecha
    const hoyP = await inquiryMetrics(db, { from: ymd(hoy), to: ymd(hoy) });
    expect(hoyP).toMatchObject({ generated: 1, convertida: 1, salesCount: 1, revenueMinor: peso(9000), salesWithoutInquiry: 0 });
    const diaP = await inquiryMetrics(db, { from: ymd(dia), to: ymd(dia) });
    expect(diaP).toMatchObject({ generated: 0, convertida: 0, salesCount: 1, revenueMinor: peso(7000), salesWithoutInquiry: 1 });
    expect(diaP.conversionGenerated).toBeNull();
    expect(await inquiryMetrics(db)).toMatchObject({ generated: 1, salesCount: 2, revenueMinor: peso(16000) });
  });
  it("las consultas CREADAS en el período cuentan aunque se conviertan después", async () => {
    const id = await newInquiry();
    await db.update(inquiries).set({ createdAt: Date.parse("2026-10-10T15:00:00-03:00") }).where(eq(inquiries.id, id));
    await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id })); // vendida hoy
    const p = await inquiryMetrics(db, { from: "2026-10-10", to: "2026-10-10" });
    expect(p).toMatchObject({ generated: 1, convertida: 1, salesCount: 0 }); // la venta es de otra fecha: no entra en este período
    expect(p.conversionGenerated).toBe(1);
  });
});

describe("historial de gestión", () => {
  it("las filas de eventos acumulan todo el recorrido sin perder nada", async () => {
    const id = await newInquiry();
    await applyInquiryAction(db, id, { action: "note", text: "Primera nota" }, actor);
    const s = (await reg(body([{ productId: "storm-sobre", quantity: 1, price: 9000 }], { inquiryId: id }))).sale;
    await voidSale(db, s.id, "Se arrepintió", actor);
    await applyInquiryAction(db, id, { action: "note", text: "Segunda nota" }, actor);
    const kinds = (await db.select().from(inquiryEvents).where(eq(inquiryEvents.inquiryId, id)).orderBy(inquiryEvents.id)).map((e) => e.kind);
    expect(kinds).toEqual(["created", "note", "contact_confirmed", "sale_created", "sale_voided", "note"]);
  });
});
