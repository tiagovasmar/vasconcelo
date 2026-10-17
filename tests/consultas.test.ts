import { beforeEach, describe, expect, it } from "vitest";
import { catalog } from "@/content/catalog";
import { inquiries, inquiryEvents, stockMovements } from "@/db/schema";
import { applyInquiryAction, createManualInquiry, getInquiryDetail, inquiryMetrics, listInquiries } from "@/features/consultas/service";
import { createInquiry, hashToken } from "@/features/inquiries/service";
import { saveProductChange } from "@/features/catalog/overrides";
import { openTestDb, type TestDb } from "./helpers/pg";

/** Registro y gestión de consultas del dueño sobre PostgreSQL real: guardado sin duplicados, contacto confirmado a mano, estados, notas, búsqueda y consultas manuales. */
const base = catalog.products;
const actor = { id: "admin-1", email: "dueno@example.com" };
const owner = { sessionTokenHash: hashToken("sesion-a") };
let n = 0;
const key = () => `clave-de-prueba-${String(++n).padStart(8, "0")}`;
let db: TestDb;
beforeEach(async () => {
  db = await openTestDb({ max: 6 });
  n = 0;
});

const newInquiry = async (over: Record<string, unknown> = {}) => {
  const { inquiry } = await createInquiry(db, { items: [{ productId: "storm-sobre", quantity: 2 }, { productId: "storm-caja", quantity: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Inés Muñoz", contactPhone: "+54 9 11 5555-0000", idempotencyKey: key(), ...over }, owner);
  return inquiry.reference;
};

describe("registro de la consulta", () => {
  it("guarda nombre, teléfono, productos, precios, entrega, pago y fecha; nace «Pendiente» y con el contacto sin confirmar", async () => {
    const id = await newInquiry();
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry).toMatchObject({ contactName: "Inés Muñoz", contactPhone: "+54 9 11 5555-0000", source: "web", crmStatus: "pendiente", contactConfirmedAt: null, deliveryMethod: "retiro", paymentPreference: "efectivo", currency: "ARS" });
    expect(d.inquiry.createdAt).toBeGreaterThan(0);
    expect(d.lines.map((l) => [l.productId, l.quantity, l.unitPriceMinor])).toEqual([["storm-sobre", 2, 950000], ["storm-caja", 1, 18500000]]);
    expect(d.events.map((e) => e.kind)).toEqual(["created"]);
  });
  it("el reintento con la misma clave no duplica la consulta ni su historial, ni siquiera en paralelo", async () => {
    const k = key();
    const body = { items: [{ productId: "storm-sobre", quantity: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Inés Muñoz", idempotencyKey: k };
    const r = await Promise.all([1, 2, 3, 4].map(() => createInquiry(db, body, owner)));
    expect(new Set(r.map((x) => x.inquiry.reference)).size).toBe(1);
    expect(r.filter((x) => !x.replayed)).toHaveLength(1);
    expect(await db.select().from(inquiries)).toHaveLength(1);
    expect(await db.select().from(inquiryEvents)).toHaveLength(1);
  });
  it("preparar la consulta no reserva ni descuenta stock", async () => {
    await newInquiry();
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });
  it("el teléfono es opcional y se valida en el servidor", async () => {
    await expect(createInquiry(db, { items: [{ productId: "storm-sobre", quantity: 1 }], delivery: { method: "retiro" }, payment: "efectivo", contactName: "Inés Muñoz", contactPhone: "abc", idempotencyKey: key() }, owner)).rejects.toMatchObject({ info: { code: "invalid_input" } });
    const id = await newInquiry({ contactPhone: undefined });
    expect((await getInquiryDetail(db, id))!.inquiry.contactPhone).toBeNull();
  });
});

describe("gestión", () => {
  it("«Consulta generada» y «Contacto confirmado» son distintos y el contacto se confirma a mano", async () => {
    const id = await newInquiry();
    expect((await getInquiryDetail(db, id))!.inquiry.contactConfirmedAt).toBeNull();
    expect(await applyInquiryAction(db, id, { action: "confirm_contact" }, actor)).toEqual({ changed: true });
    expect(await applyInquiryAction(db, id, { action: "confirm_contact" }, actor)).toEqual({ changed: false });
    expect((await getInquiryDetail(db, id))!.inquiry.contactConfirmedAt).not.toBeNull();
    await applyInquiryAction(db, id, { action: "unconfirm_contact" }, actor);
    expect((await getInquiryDetail(db, id))!.inquiry.contactConfirmedAt).toBeNull();
  });
  it("estados, motivo opcional de no concreción, notas e historial; cambiar de estado no toca el stock", async () => {
    const id = await newInquiry();
    await applyInquiryAction(db, id, { action: "set_status", status: "en_seguimiento" }, actor);
    await applyInquiryAction(db, id, { action: "note", text: "Le escribí el martes, responde a la tarde." }, actor);
    await applyInquiryAction(db, id, { action: "set_status", status: "no_concretada", reason: "Le pareció caro" }, actor);
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry).toMatchObject({ crmStatus: "no_concretada", lostReason: "Le pareció caro" });
    expect(d.events.map((e) => e.kind).reverse()).toEqual(["created", "status", "note", "status"]);
    expect(await db.select().from(stockMovements)).toHaveLength(0);
    await applyInquiryAction(db, id, { action: "set_status", status: "pendiente" }, actor);
    expect((await getInquiryDetail(db, id))!.inquiry.lostReason).toBeNull(); // el motivo solo vale para «No concretada»
  });
  it("«convertida» no se puede poner a mano", async () => {
    const id = await newInquiry();
    await expect(applyInquiryAction(db, id, { action: "set_status", status: "convertida" }, actor)).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("el historial de gestión no se edita ni se borra (la base lo impide)", async () => {
    const id = await newInquiry();
    await expect(db.$client`update inquiry_events set detail = 'otra cosa' where inquiry_id = ${id}`).rejects.toThrow(/no se edita ni se borra/);
    await expect(db.$client`delete from inquiry_events where inquiry_id = ${id}`).rejects.toThrow(/no se edita ni se borra/);
    expect(await db.select().from(inquiryEvents)).toHaveLength(1);
  });
  it("la consulta original no cambia aunque después cambien el precio o el stock del producto", async () => {
    const id = await newInquiry();
    await saveProductChange(db, base, "storm-sobre", { priceUsdMinor: 5000, stock: 7, expectedVersion: 0 }, actor);
    const d = (await getInquiryDetail(db, id))!;
    expect(d.lines.find((l) => l.productId === "storm-sobre")).toMatchObject({ unitPriceMinor: 950000, quantity: 2 });
    expect(d.inquiry.subtotalMinor).toBe(2 * 950000 + 18500000);
  });
  it("búsqueda por nombre, teléfono (con o sin formato) y número; filtros por estado, contacto y fecha", async () => {
    const a = await newInquiry();
    const b = await newInquiry({ contactName: "Pedro Gómez", contactPhone: "11 4444-9999" });
    await applyInquiryAction(db, b, { action: "set_status", status: "en_seguimiento" }, actor);
    await applyInquiryAction(db, b, { action: "confirm_contact" }, actor);
    const ids = async (f: Parameters<typeof listInquiries>[1]) => (await listInquiries(db, f)).rows.map((r) => r.id).sort();
    expect(await ids({ q: "ines munoz" })).toEqual([a]);
    expect(await ids({ q: "GOMEZ" })).toEqual([b]);
    expect(await ids({ q: "4444-9999" })).toEqual([b]);
    expect(await ids({ q: "1144449999" })).toEqual([b]);
    expect(await ids({ q: a.toLowerCase() })).toEqual([a]);
    expect(await ids({ q: "nadie" })).toEqual([]);
    expect(await ids({ status: "en_seguimiento" })).toEqual([b]);
    expect(await ids({ contact: "confirmado" })).toEqual([b]);
    expect(await ids({ contact: "sin_confirmar" })).toEqual([a]);
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    expect(await ids({ from: today, to: today })).toEqual([a, b].sort());
    expect(await ids({ from: "2020-01-01", to: "2020-01-02" })).toEqual([]);
    expect((await listInquiries(db, { q: "%" })).rows).toHaveLength(0); // los comodines se tratan como texto
  });
});

describe("consultas manuales", () => {
  const manual = (over: Record<string, unknown> = {}) => ({ idempotencyKey: key(), customerName: "Lucía Paz", customerPhone: "11 2222-3333", channel: "instagram", paymentMethod: "transferencia", lines: [{ productId: "storm-caja", quantity: 1, fulfillment: "stock", unitPriceMinor: 18500000 }], ...over });
  it("se cargan con medio, fecha y contacto ya confirmado; no pertenecen a ninguna sesión ni cuenta; no tocan el stock", async () => {
    const past = Date.now() - 5 * 24 * 3600 * 1000;
    const { id, replayed } = await createManualInquiry(db, manual({ receivedAt: past }), actor);
    expect(replayed).toBe(false);
    const d = (await getInquiryDetail(db, id))!;
    expect(d.inquiry).toMatchObject({ source: "manual", crmStatus: "pendiente", contactName: "Lucía Paz", userId: null, createdAt: past, contactConfirmedAt: past, paymentPreference: "transferencia" });
    expect(d.events[0]).toMatchObject({ kind: "created", actorEmail: actor.email });
    expect(d.events[0].detail).toContain("Instagram");
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });
  it("doble clic: una sola consulta", async () => {
    const m = manual();
    const r = await Promise.all([1, 2, 3].map(() => createManualInquiry(db, m, actor)));
    expect(new Set(r.map((x) => x.id)).size).toBe(1);
    expect((await listInquiries(db)).total).toBe(1);
  });
  it("valida nombre completo, medio, fecha y productos", async () => {
    await expect(createManualInquiry(db, manual({ customerName: "Lucía" }), actor)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createManualInquiry(db, manual({ channel: "paloma" }), actor)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createManualInquiry(db, manual({ receivedAt: Date.now() + 9e8 }), actor)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(createManualInquiry(db, manual({ lines: [{ productId: "no-existe", quantity: 1, fulfillment: "stock", unitPriceMinor: 1 }] }), actor)).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("métricas", () => {
  it("generadas, contactos, estados y conversión sobre generadas y sobre contactos confirmados", async () => {
    const [, b, c, d] = [await newInquiry(), await newInquiry(), await newInquiry(), await newInquiry()];
    await applyInquiryAction(db, b, { action: "confirm_contact" }, actor);
    await applyInquiryAction(db, c, { action: "set_status", status: "no_concretada", reason: "Caro" }, actor);
    await applyInquiryAction(db, d, { action: "set_status", status: "en_seguimiento" }, actor);
    const m = await inquiryMetrics(db);
    expect(m).toMatchObject({ generated: 4, web: 4, manual: 0, contactConfirmed: 1, pendiente: 2, enSeguimiento: 1, noConcretada: 1, convertida: 0, salesCount: 0 });
    expect(m.conversionGenerated).toBe(0);
  });
  it("sin consultas no hay porcentajes (no se divide por cero)", async () => {
    expect(await inquiryMetrics(db)).toMatchObject({ generated: 0, conversionGenerated: null, conversionConfirmed: null, salesCount: 0, revenueMinor: 0 });
  });
});
