import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { catalog } from "@/content/catalog";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { inquiries, inquiryLines, lineDeliveries, notificationOutbox, orderEvents, orderPayments, orderRefunds, orderTracks, paymentReceipts, user } from "@/db/schema";
import { createInquiry, hashToken } from "@/features/inquiries/service";
import { adminOrderDetail, canView, customerOrderView, issueAccessLink, lineProgress, openTracking, setAgreedAmount, setStage, addNote, cancelOrder } from "@/features/pedidos/service";
import { confirmPayment, markRefunded, openIncident, registerRefund, rejectReceipt, sniffReceiptType, uploadReceipt, voidPayment } from "@/features/pedidos/pagos";
import { createShipment, recordDelivery, setShipmentItem, updateShipmentStatus } from "@/features/pedidos/envios";
import { flushOutbox } from "@/features/avisos/outbox";
import { SaleError } from "@/features/sales/errors";
import type { ReceiptStore } from "@/server/receipt-store";
import type { Mail } from "@/server/mail";

/**
 * Seguimiento, pagos, comprobantes, incidentes, reintegros, envíos agrupados, entregas parciales y avisos, sobre PostgreSQL real.
 * Catálogo de prueba con dos productos sin precio ni stock para consultarlos por encargo.
 */
let db: Db;
const nowDate = new Date();
const actor = { id: "admin-1", email: "dueno@example.com" };
const retiro = { method: "retiro" } as const;
let n = 0;
const key = () => `clave-prueba-${String(++n).padStart(10, "0")}`;
const products = catalog.products.map((p) => (p.id === "storm-sobre" || p.id === "ejemplo-sobre" ? { ...p, priceMinor: null, stockQuantity: null } : p));
const addUser = (id: string, verified = true) => db.insert(user).values({ id, name: `Usuaria ${id}`, email: `${id}@example.com`, emailVerified: verified, createdAt: nowDate, updatedAt: nowDate });
const T0 = Date.UTC(2026, 10, 2, 15, 0, 0);
const day = (d: number) => T0 + d * 86_400_000;

async function encargo(userId: string | null, items = [{ productId: "storm-sobre", quantity: 3 }, { productId: "ejemplo-sobre", quantity: 2 }], extra: Record<string, unknown> = {}) {
  const { inquiry } = await createInquiry(db, { items: items.map((i) => ({ ...i, mode: "encargo" })), delivery: retiro, payment: "efectivo", contactName: "Ana Pérez", idempotencyKey: key(), ...extra }, { sessionTokenHash: hashToken(`sesion-${userId ?? "invitado"}`), userId, products });
  return inquiry.reference;
}
const st = (ref: string, stage: string, d: number, over: Record<string, unknown> = {}) => setStage(db, ref, { stage, occurredAt: day(d), idempotencyKey: key(), ...over }, actor, day(d));
const pay = (ref: string, amount: number, d: number, over: Record<string, unknown> = {}) => confirmPayment(db, ref, { kind: "sena", amountMinor: amount, method: "transferencia", paidAt: day(d), idempotencyKey: key(), ...over }, actor, day(d));
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
const sent: Mail[] = [];
const okSend = async (m: Mail) => { sent.push(m); };

beforeEach(async () => {
  db = await openTestDb({ max: 4 });
  n = 0;
  sent.length = 0;
  await addUser("ana");
  await addUser("beto");
});

/** Deja un encargo comprado al proveedor con seña pagada (importe acordado $100.000, seña $20.000). */
async function encargoComprado(userId: string | null = "ana") {
  const ref = await encargo(userId);
  await openTracking(db, ref, day(0));
  await setAgreedAmount(db, ref, { agreedMinor: 10_000_000 }, actor, day(1));
  await st(ref, "confirmado_tienda", 1);
  await pay(ref, 2_000_000, 2);
  await st(ref, "comprado_proveedor", 3);
  return ref;
}

describe("proceso de un encargo", () => {
  it("recorre las etapas acordadas con fechas reales y la seña del 20% se confirma con el pago", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    expect((await customerOrderView(db, ref))!.stage).toBe("solicitud_recibida");
    expect(await code(st(ref, "confirmado_tienda", 1))).toBe("order_rule"); // sin importe acordado
    await setAgreedAmount(db, ref, { agreedMinor: 10_000_000 }, actor, day(1));
    await st(ref, "confirmado_tienda", 1);
    expect(await code(st(ref, "sena_confirmada", 2))).toBe("order_rule"); // sin pago confirmado
    expect(await code(st(ref, "comprado_proveedor", 2))).toBe("order_rule"); // no se compra sin seña
    const p = await pay(ref, 2_000_000, 2);
    expect(p.replayed).toBe(false);
    const v = (await customerOrderView(db, ref))!;
    expect(v.stage).toBe("sena_confirmada"); // la seña confirmada registra la etapa con la fecha del pago
    expect(v.steps.find((s) => s.stage === "sena_confirmada")!.reachedAt).toBe(day(2));
    expect(v.paymentStatus).toBe("parcial");
    await st(ref, "comprado_proveedor", 3);
    expect((await customerOrderView(db, ref))!.stage).toBe("comprado_proveedor");
  });

  it("repetir un cambio de etapa con la misma clave no duplica nada; una etapa anterior exige «corregir»", async () => {
    const ref = await encargoComprado();
    const k = key();
    const a = await setStage(db, ref, { stage: "comprado_proveedor", occurredAt: day(4), idempotencyKey: k }, actor, day(4));
    expect(a.changed).toBe(false); // ya estaba
    expect(await code(st(ref, "confirmado_tienda", 5))).toBe("order_rule");
    await setStage(db, ref, { stage: "confirmado_tienda", occurredAt: day(5), correction: true, idempotencyKey: key() }, actor, day(5));
    expect((await customerOrderView(db, ref))!.stage).toBe("confirmado_tienda");
  });

  it("no avanza por el paso del tiempo: sin acciones del dueño, la etapa y las fechas no cambian", async () => {
    const ref = await encargoComprado();
    const before = await db.select().from(orderEvents).where(eq(orderEvents.inquiryId, ref));
    const later = Date.now() + 90 * 86_400_000;
    await customerOrderView(db, ref);
    await flushOutbox(db, { send: okSend, now: later });
    expect((await db.select().from(orderEvents).where(eq(orderEvents.inquiryId, ref))).length).toBe(before.length);
    expect((await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ref)))[0].stage).toBe("comprado_proveedor");
  });
});

describe("pagos separados de la logística", () => {
  it("el estado del pago no depende de la etapa y no se paga más que lo acordado", async () => {
    const ref = await encargoComprado();
    expect((await customerOrderView(db, ref))!.paymentStatus).toBe("parcial");
    expect(await code(pay(ref, 9_000_000, 4, { kind: "saldo" }))).toBe("order_rule"); // superaría el acordado
    await pay(ref, 8_000_000, 4, { kind: "saldo" });
    const v = (await customerOrderView(db, ref))!;
    expect(v.paymentStatus).toBe("completo");
    expect(v.stage).toBe("comprado_proveedor"); // pagar el total no mueve la logística
    expect(v.action).not.toMatch(/deuda|saldo pendiente/i);
  });

  it("doble clic y reintentos con la misma clave devuelven el mismo pago; con otros datos, 422", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    await setAgreedAmount(db, ref, { agreedMinor: 10_000_000 }, actor, day(0));
    const k = key();
    const body = { kind: "sena", amountMinor: 2_000_000, method: "transferencia", paidAt: day(1), idempotencyKey: k };
    const [a, b] = await Promise.all([confirmPayment(db, ref, body, actor, day(1)), confirmPayment(db, ref, body, actor, day(1))]);
    expect(a.payment.id).toBe(b.payment.id);
    expect(await db.select().from(orderPayments)).toHaveLength(1);
    expect(await code(confirmPayment(db, ref, { ...body, amountMinor: 3_000_000 }, actor, day(1)))).toBe("idempotency_conflict");
    expect(await code(confirmPayment(db, ref, { ...body, amountMinor: 0, idempotencyKey: key() }, actor, day(1)))).toBe("invalid_input");
  });

  it("el importe acordado no se cambia después de un pago confirmado", async () => {
    const ref = await encargoComprado();
    expect(await code(setAgreedAmount(db, ref, { agreedMinor: 9_000_000 }, actor, day(5)))).toBe("order_rule");
  });

  it("anular un pago deja historia y no lo borra", async () => {
    const ref = await encargoComprado();
    const p = (await db.select().from(orderPayments))[0];
    await voidPayment(db, p.id, { reason: "Cargado dos veces" }, actor, day(5));
    expect((await db.select().from(orderPayments))[0]).toMatchObject({ status: "anulado" });
    expect((await customerOrderView(db, ref))!.payments).toHaveLength(0);
  });
});

describe("comprobantes de transferencia", () => {
  const memStore = (): ReceiptStore & { files: Map<string, Buffer> } => {
    const files = new Map<string, Buffer>();
    return { driver: "local", files, put: async (k, d) => { files.set(k, d); }, get: async (k) => files.get(k) ?? null, remove: async (k) => { files.delete(k); } };
  };
  const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n${extra}\n%%EOF`);

  it("subirlo NO confirma el pago: queda pendiente de revisión y el estado de pago lo muestra aparte", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    await setAgreedAmount(db, ref, { agreedMinor: 10_000_000 }, actor, day(0));
    const store = memStore();
    const r = await uploadReceipt(db, store, { inquiryId: ref, viewer: { kind: "cuenta", userId: "ana" }, file: pdf("a"), originalName: "transf.pdf", declaredAmountMinor: 2_000_000 }, day(1));
    expect(r.duplicate).toBe(false);
    expect(await db.select().from(orderPayments)).toHaveLength(0);
    const v = (await customerOrderView(db, ref))!;
    expect(v.paymentStatus).toBe("comprobante_en_revision");
    expect(v.pendingReceipts).toBe(1);
    expect(v.payments).toHaveLength(0);
    // Se guardó en el almacén privado, con un nombre aleatorio, y la fila no expone la ruta al cliente.
    expect([...store.files.keys()][0]).toMatch(/^rc-[0-9a-f]{36}\.pdf$/);
    expect(JSON.stringify(v)).not.toContain("rc-");
  });

  it("el mismo archivo dos veces (o en simultáneo) no se duplica; cada pedido tiene los suyos", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    const store = memStore();
    const up = () => uploadReceipt(db, store, { inquiryId: ref, viewer: { kind: "cuenta", userId: "ana" }, file: pdf("igual") }, day(1));
    const [a, b] = await Promise.all([up(), up()]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(paymentReceipts)).toHaveLength(1);
    expect(store.files.size).toBe(1); // el archivo huérfano de la carrera se borra
    const otro = await encargo("beto");
    await openTracking(db, otro, day(0));
    const c = await uploadReceipt(db, store, { inquiryId: otro, viewer: { kind: "cuenta", userId: "beto" }, file: pdf("igual") }, day(1));
    expect(c.id).not.toBe(a.id);
  });

  it("valida tipo REAL, tamaño y vacío; un ejecutable renombrado como .pdf se rechaza", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    const store = memStore();
    const base = { inquiryId: ref, viewer: { kind: "cuenta", userId: "ana" } as const };
    expect(await code(uploadReceipt(db, store, { ...base, file: Buffer.from("MZ\x90\x00 programa"), originalName: "factura.pdf" }))).toBe("unsupported");
    expect(await code(uploadReceipt(db, store, { ...base, file: Buffer.alloc(0) }))).toBe("invalid_input");
    expect(await code(uploadReceipt(db, store, { ...base, file: Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(4 * 1024 * 1024)]) }))).toBe("too_large");
    expect(store.files.size).toBe(0);
    expect(sniffReceiptType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffReceiptType(Buffer.from("<html>"))).toBeNull();
  });

  it("confirmar el ingreso crea el pago, acepta el comprobante y no se reutiliza; rechazar no crea pago", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    await setAgreedAmount(db, ref, { agreedMinor: 10_000_000 }, actor, day(0));
    const store = memStore();
    const a = await uploadReceipt(db, store, { inquiryId: ref, viewer: { kind: "cuenta", userId: "ana" }, file: pdf("1") }, day(1));
    const b = await uploadReceipt(db, store, { inquiryId: ref, viewer: { kind: "cuenta", userId: "ana" }, file: pdf("2") }, day(1));
    await rejectReceipt(db, b.id, { reason: "Se ve cortado" }, actor, day(2));
    expect((await customerOrderView(db, ref))!.receipts.find((r) => r.id === b.id)).toMatchObject({ status: "rechazado", rejectReason: "Se ve cortado" });
    await pay(ref, 2_000_000, 2, { receiptId: a.id });
    expect((await db.select().from(paymentReceipts).where(eq(paymentReceipts.id, a.id)))[0].status).toBe("aceptado");
    expect(await code(pay(ref, 2_000_000, 3, { receiptId: a.id, kind: "saldo" }))).toBe("order_rule"); // ya revisado
    expect(await code(rejectReceipt(db, a.id, { reason: "Ya no" }, actor))).toBe("order_rule");
    expect(await db.select().from(orderPayments)).toHaveLength(1);
  });
});

describe("incidentes y reintegros", () => {
  it("registrar un incidente y un reintegro NO mueve dinero ni lo da por devuelto; marcarlo exige fecha y constancia", async () => {
    const ref = await encargoComprado();
    const inc = await openIncident(db, ref, { kind: "paquete_perdido", internalDetail: "El courier lo extravió", publicText: "El paquete se extravió en tránsito.", openedAt: day(10), idempotencyKey: key() }, actor, day(10));
    await cancelOrder(db, ref, { reason: "No se pudo cumplir", idempotencyKey: key() }, actor, day(11));
    let v = (await customerOrderView(db, ref))!;
    expect(v.cancelled).toBe(true);
    expect(v.refunds).toHaveLength(0); // cancelar no es reintegrar
    expect(await code(registerRefund(db, ref, { incidentId: inc.id, amountMinor: 2_500_000, idempotencyKey: key() }, actor, day(11)))).toBe("order_rule"); // más de lo pagado
    const k = key();
    const [r1, r2] = await Promise.all([1, 2].map(() => registerRefund(db, ref, { incidentId: inc.id, amountMinor: 2_000_000, idempotencyKey: k }, actor, day(11))));
    expect(r1.id).toBe(r2.id);
    expect(await code(registerRefund(db, ref, { amountMinor: 100_000, idempotencyKey: key() }, actor, day(11)))).toBe("order_rule"); // ya se registró todo lo pagado
    v = (await customerOrderView(db, ref))!;
    expect(v.refunds).toEqual([{ id: r1.id, amountMinor: 2_000_000, status: "pendiente", refundedAt: null }]);
    expect(await code(markRefunded(db, r1.id, { refundedAt: day(12), evidence: "" }, actor))).toBe("invalid_input");
    await markRefunded(db, r1.id, { refundedAt: day(12), evidence: "Transf. 99887766" }, actor, day(12));
    expect(await markRefunded(db, r1.id, { refundedAt: day(13), evidence: "otra" }, actor)).toEqual({ changed: false });
    const row = (await db.select().from(orderRefunds))[0];
    expect(row).toMatchObject({ status: "reintegrado", refundedAt: day(12), evidence: "Transf. 99887766" });
    expect(JSON.stringify((await customerOrderView(db, ref))!)).not.toContain("99887766"); // la constancia es interna
  });
});

describe("envíos agrupados y entregas parciales", () => {
  it("un envío con artículos de dos pedidos solo marca como llegados los que viajaron", async () => {
    const a = await encargoComprado("ana"); // 3 storm-sobre + 2 ejemplo-sobre
    const b = await encargoComprado("beto");
    const la = await lineProgress(db, a);
    const lb = await lineProgress(db, b);
    const sh = await createShipment(db, { label: "Lote 1", idempotencyKey: key() }, actor, day(4));
    await setShipmentItem(db, sh.id, { lineId: la[0].lineId, quantity: 2 }); // 2 de las 3
    await setShipmentItem(db, sh.id, { lineId: lb[1].lineId, quantity: 2 });
    expect(await code(setShipmentItem(db, sh.id, { lineId: la[0].lineId, quantity: 4 }))).toBe("order_rule"); // más de lo pedido
    await updateShipmentStatus(db, sh.id, { status: "enviado_proveedor", occurredAt: day(5), idempotencyKey: key() }, actor, day(5));
    await updateShipmentStatus(db, sh.id, { status: "recibido_argentina", occurredAt: day(20), idempotencyKey: key() }, actor, day(20));
    const pa = await lineProgress(db, a);
    expect(pa[0]).toMatchObject({ quantity: 3, arrived: 2, notShipped: 1, inTransit: 0, delivered: 0, deliverable: 2 });
    expect(pa[1]).toMatchObject({ quantity: 2, arrived: 0, notShipped: 2 }); // no viajó: NO figura recibido
    const va = (await customerOrderView(db, a))!;
    expect(va.stage).toBe("comprado_proveedor"); // el pedido completo no llegó: sigue en su etapa
    expect(va.timeline.some((t) => /Recibido en Argentina: 2 × /.test(t.text))).toBe(true);
    // Pedido de beto: solo 2 de 5 unidades viajaron, tampoco avanza.
    expect((await customerOrderView(db, b))!.stage).toBe("comprado_proveedor");
    // Mismo estado dos veces = nada que hacer; retroceder se rechaza.
    expect((await updateShipmentStatus(db, sh.id, { status: "recibido_argentina", occurredAt: day(21), idempotencyKey: key() }, actor)).changed).toBe(false);
    expect(await code(updateShipmentStatus(db, sh.id, { status: "en_transito", occurredAt: day(22), idempotencyKey: key() }, actor))).toBe("order_rule");
  });

  it("un pedido puede llegar en varios envíos y avanza a «Recibido en Argentina» solo cuando llegó todo; se entrega en partes y figura entregado al completarse", async () => {
    const ref = await encargoComprado("ana");
    const lines = await lineProgress(db, ref);
    const s1 = await createShipment(db, { label: "Lote A", idempotencyKey: key() }, actor, day(4));
    const s2 = await createShipment(db, { label: "Lote B", idempotencyKey: key() }, actor, day(4));
    await setShipmentItem(db, s1.id, { lineId: lines[0].lineId, quantity: 3 });
    await setShipmentItem(db, s2.id, { lineId: lines[1].lineId, quantity: 2 });
    for (const s of [s1, s2]) await updateShipmentStatus(db, s.id, { status: "enviado_proveedor", occurredAt: day(5), idempotencyKey: key() }, actor, day(5));
    expect((await customerOrderView(db, ref))!.stage).toBe("enviado_proveedor"); // todo salió
    await updateShipmentStatus(db, s1.id, { status: "recibido_argentina", occurredAt: day(15), idempotencyKey: key() }, actor, day(15));
    expect((await customerOrderView(db, ref))!.stage).toBe("enviado_proveedor"); // falta el lote B
    // Entregar lo que llegó exige el pago completo.
    expect(await code(recordDelivery(db, ref, { lines: [{ lineId: lines[0].lineId, quantity: 1 }], method: "retiro", deliveredAt: day(16), idempotencyKey: key() }, actor, day(16)))).toBe("order_rule");
    await pay(ref, 8_000_000, 16, { kind: "saldo" });
    expect(await code(recordDelivery(db, ref, { lines: [{ lineId: lines[1].lineId, quantity: 1 }], method: "retiro", deliveredAt: day(16), idempotencyKey: key() }, actor, day(16)))).toBe("order_rule"); // aún no llegó
    const k = key();
    const d1 = { lines: [{ lineId: lines[0].lineId, quantity: 2 }], method: "retiro", deliveredAt: day(16), idempotencyKey: k };
    expect(await recordDelivery(db, ref, d1, actor, day(16))).toMatchObject({ replayed: false, complete: false });
    expect(await recordDelivery(db, ref, d1, actor, day(16))).toMatchObject({ replayed: true }); // reintento
    expect(await db.select().from(lineDeliveries)).toHaveLength(1);
    expect(await code(recordDelivery(db, ref, { lines: [{ lineId: lines[0].lineId, quantity: 2 }], method: "retiro", deliveredAt: day(16), idempotencyKey: key() }, actor, day(16)))).toBe("order_rule"); // solo 1 más
    expect(await code(st(ref, "entregado", 17))).toBe("order_rule"); // no se marca entregado por entregar una parte
    await updateShipmentStatus(db, s2.id, { status: "recibido_argentina", occurredAt: day(18), idempotencyKey: key() }, actor, day(18));
    expect((await customerOrderView(db, ref))!.stage).toBe("recibido_argentina");
    const last = await recordDelivery(db, ref, { lines: [{ lineId: lines[0].lineId, quantity: 1 }, { lineId: lines[1].lineId, quantity: 2 }], method: "envio", deliveredAt: day(19), idempotencyKey: key() }, actor, day(19));
    expect(last.complete).toBe(true);
    const v = (await customerOrderView(db, ref))!;
    expect(v.stage).toBe("entregado");
    expect(v.items.every((i) => i.delivered === i.quantity)).toBe(true);
  });

  it("no se puede enviar una unidad de un pedido sin seña ni de un artículo que no sea encargo", async () => {
    const ref = await encargo("ana");
    await openTracking(db, ref, day(0));
    const [l] = await lineProgress(db, ref);
    const sh = await createShipment(db, { label: "Lote X", idempotencyKey: key() }, actor, day(1));
    expect(await code(setShipmentItem(db, sh.id, { lineId: l.lineId, quantity: 1 }))).toBe("order_rule"); // todavía no comprado al proveedor
    expect(await code(updateShipmentStatus(db, sh.id, { status: "enviado_proveedor", occurredAt: day(2), idempotencyKey: key() }, actor))).toBe("order_rule"); // sin artículos
  });
});

describe("avisos por correo", () => {
  it("el cambio de etapa se encola con el cambio, sin duplicados, y un envío fallido no deshace el cambio ni se reenvía si ya salió", async () => {
    const ref = await encargoComprado("ana");
    const lines = await lineProgress(db, ref);
    const sh = await createShipment(db, { label: "Lote L", idempotencyKey: key() }, actor, day(4));
    for (const l of lines) await setShipmentItem(db, sh.id, { lineId: l.lineId, quantity: l.quantity });
    await updateShipmentStatus(db, sh.id, { status: "enviado_proveedor", occurredAt: day(5), idempotencyKey: key() }, actor, day(5));
    let rows = await db.select().from(notificationOutbox).orderBy(notificationOutbox.id);
    const events = rows.map((r) => r.event);
    expect(events).toContain("pago_confirmado");
    expect(events).toContain("enviado_proveedor");
    expect(rows.every((r) => r.status === "pendiente")).toBe(true);

    // El proveedor de correo falla: el estado del pedido se conserva y el aviso queda «fallido».
    const failing = async () => { throw new Error("proveedor caído"); };
    const r1 = await flushOutbox(db, { send: failing });
    expect(r1.failed).toBe(rows.length);
    expect((await customerOrderView(db, ref))!.stage).toBe("enviado_proveedor");
    rows = await db.select().from(notificationOutbox);
    expect(rows.every((r) => r.status === "fallido" && r.attempts === 1 && /proveedor caído/.test(r.lastError ?? ""))).toBe(true);

    // Reintento: se envía una sola vez cada aviso, aun con dos reintentos simultáneos.
    await Promise.all([flushOutbox(db, { send: okSend }), flushOutbox(db, { send: okSend })]);
    expect(sent).toHaveLength(rows.length);
    expect(new Set(sent.map((m) => m.subject + m.text)).size).toBe(rows.length);
    expect(sent.every((m) => m.to === "ana@example.com" && m.kind === "aviso")).toBe(true);
    // Lo ya enviado no se reenvía.
    expect(await flushOutbox(db, { send: okSend })).toEqual({ sent: 0, failed: 0, skipped: 0 });
    // Repetir el mismo hecho tampoco encola de nuevo.
    await updateShipmentStatus(db, sh.id, { status: "enviado_proveedor", occurredAt: day(6), idempotencyKey: key() }, actor);
    expect(await db.select().from(notificationOutbox)).toHaveLength(rows.length);
  });

  it("los avisos no llevan datos bancarios, ni notas internas, y los invitados (sin correo) no reciben ninguno", async () => {
    const ref = await encargoComprado("ana");
    await addNote(db, ref, { internalText: "CBU 0000003100012345678901 del proveedor", publicText: "Estamos coordinando.", idempotencyKey: key() }, actor, day(6));
    await flushOutbox(db, { send: okSend });
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) { expect(m.text).not.toMatch(/CBU|cbu|0000003100/); expect(m.text).not.toMatch(/Estamos coordinando/); }
    const guest = await encargo(null);
    await openTracking(db, guest, day(0));
    await setAgreedAmount(db, guest, { agreedMinor: 5_000_000 }, actor, day(1));
    await pay(guest, 1_000_000, 2);
    expect((await db.select().from(notificationOutbox)).filter((r) => r.inquiryId === guest)).toHaveLength(0);
  });
});

describe("acceso a los pedidos", () => {
  it("una cuenta solo ve sus pedidos; conocer la referencia no alcanza; el invitado entra por su cookie o por el enlace privado, nunca por la referencia", async () => {
    const ref = await encargo("ana");
    const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, ref));
    await openTracking(db, ref, day(0));
    const [track] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ref));
    expect(canView(inq, track, { userId: "ana" })).toBe(true);
    expect(canView(inq, track, { userId: "beto" })).toBe(false);
    expect(canView(inq, track, {})).toBe(false);
    const { token } = await issueAccessLink(db, ref, day(1));
    const [track2] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ref));
    expect(canView(inq, track2, { accessToken: token })).toBe(false); // el pedido es de una cuenta: el enlace de invitado no lo abre
    const g = await encargo(null);
    await openTracking(db, g, day(0));
    const [ginq] = await db.select().from(inquiries).where(eq(inquiries.id, g));
    const [gt] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, g));
    expect(canView(ginq, gt, { sessionTokenHash: hashToken("sesion-invitado") })).toBe(true);
    expect(canView(ginq, gt, { sessionTokenHash: hashToken("otra-sesion") })).toBe(false);
    expect(canView(ginq, gt, { userId: "ana" })).toBe(false);
    const link = await issueAccessLink(db, g, day(1));
    const [gt2] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, g));
    expect(canView(ginq, gt2, { accessToken: link.token })).toBe(true);
    expect(canView(ginq, gt2, { accessToken: "x".repeat(32) })).toBe(false);
    const again = await issueAccessLink(db, g, day(2)); // un enlace nuevo invalida el anterior
    const [gt3] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, g));
    expect(canView(ginq, gt3, { accessToken: link.token })).toBe(false);
    expect(canView(ginq, gt3, { accessToken: again.token })).toBe(true);
  });

  it("la vista de la cliente no contiene notas internas, costos, correos del equipo ni claves del almacén", async () => {
    const ref = await encargoComprado("ana");
    await addNote(db, ref, { internalText: "NOTA-SECRETA proveedor Shenzhen cuesta 12 RMB", publicText: "Todo en marcha.", idempotencyKey: key() }, actor, day(6));
    const json = JSON.stringify(await customerOrderView(db, ref));
    expect(json).toContain("Todo en marcha.");
    expect(json).not.toMatch(/NOTA-SECRETA|RMB|dueno@example\.com|storage|internal|cost/i);
    const admin = await adminOrderDetail(db, ref);
    expect(JSON.stringify(admin)).toContain("NOTA-SECRETA");
  });
});

void inquiryLines;
