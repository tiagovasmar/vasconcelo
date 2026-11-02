import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import { inquiries, inquiryLines, orderTracks, productOverrides, user, wholesaleTiers } from "@/db/schema";
import { createWholesaleRequest, reviewWholesaleRequest } from "@/features/wholesale/service";
import { createWholesaleOrder, deleteTier, getRules, missingForOpening, publishTiers, quote, saveRules, saveTier, tierFor, wholesaleAccess, wholesaleCatalog } from "@/features/mayorista/precios";
import { setManualRate, setMode } from "@/features/fx/service";
import { SaleError } from "@/features/sales/errors";
import { canView, customerOrderView } from "@/features/pedidos/service";
import { hashToken } from "@/features/inquiries/service";
import { loadOverrides } from "@/features/catalog/overrides";

/**
 * Catálogo y pedidos mayoristas con DATOS FICTICIOS de prueba. Nada de esto son condiciones reales: el dueño todavía no definió compra mínima,
 * combinación de productos, tramos ni demoras. Dólar fijado en 1.500 → USD 10,00 = $15.000.
 */
let db: Db;
const actor = { id: "admin-1", email: "dueno@example.com" };
const d = new Date();
const code = async (p: Promise<unknown>) => { try { await p; } catch (e) { if (e instanceof SaleError) return e.code; throw e; } throw new Error("se esperaba un error"); };
let n = 0;
const key = () => `clave-mayor-${String(++n).padStart(10, "0")}`;
const datos = { businessName: "Kiosco Prueba", locality: "Haedo", province: "Buenos Aires" };
const REGLAS = { minUnits: 10, minAmountMinor: null, combine: "producto" as const, delayText: "entre 30 y 60 días (dato ficticio de prueba)", delayFrom: "la confirmación de la seña", open: true };

beforeEach(async () => {
  db = await openTestDb({ max: 4 });
  n = 0;
  await db.insert(user).values(["ana", "beto", "carla"].map((id) => ({ id, name: `Usuaria ${id}`, email: `${id}@example.com`, emailVerified: true, createdAt: d, updatedAt: d })));
  await setManualRate(db, 1500, actor, "prueba");
  await setMode(db, "manual", actor);
});

const aprobar = async (uid: string) => { const { request } = await createWholesaleRequest(db, uid, datos); await reviewWholesaleRequest(db, request.reference, "aprobada", actor.email); };
/** Deja el catálogo abierto con datos ficticios: storm-sobre 10→USD 10, 50→USD 8; ejemplo-sobre 20→USD 5. */
async function abrir() {
  await saveTier(db, { productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 1000 }, actor);
  await saveTier(db, { productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 800 }, actor);
  await saveTier(db, { productId: "ejemplo-sobre", minQty: 20, unitPriceUsdMinor: 500 }, actor);
  await publishTiers(db, "storm-sobre", actor);
  await publishTiers(db, "ejemplo-sobre", actor);
  await saveRules(db, REGLAS, actor);
}

describe("acceso: solo cuentas aprobadas por el dueño, validado en el servidor", () => {
  it("sin sesión, sin solicitud, pendiente, rechazada o con el catálogo cerrado no hay acceso; aprobada y abierto, sí", async () => {
    expect(await wholesaleAccess(db, null)).toMatchObject({ ok: false, reason: "no_session" });
    expect(await wholesaleAccess(db, "ana")).toMatchObject({ ok: false, reason: "sin_solicitud" });
    const { request } = await createWholesaleRequest(db, "ana", datos);
    expect(await wholesaleAccess(db, "ana")).toMatchObject({ ok: false, reason: "pendiente" });
    await reviewWholesaleRequest(db, request.reference, "aprobada", actor.email);
    const cerrado = await wholesaleAccess(db, "ana");
    expect(cerrado).toMatchObject({ ok: false, reason: "cerrado" });
    expect((cerrado as { missing: string[] }).missing.length).toBeGreaterThan(0); // dice qué falta definir
    await abrir();
    expect(await wholesaleAccess(db, "ana")).toEqual({ ok: true });
    expect(await wholesaleAccess(db, "beto")).toMatchObject({ ok: false, reason: "sin_solicitud" }); // otra cuenta: nada
    await reviewWholesaleRequest(db, request.reference, "rechazada", actor.email);
    expect(await wholesaleAccess(db, "ana")).toMatchObject({ ok: false, reason: "rechazada" }); // revocable
  });

  it("el catálogo no se puede abrir sin definir mínimo, combinación, demora y un tramo publicado; el borrador no llega al catálogo", async () => {
    expect(missingForOpening({ minUnits: null, minAmountMinor: null, combine: null, delayText: null, delayFrom: null }, 0)).toHaveLength(4);
    expect(await code(saveRules(db, { ...REGLAS }, actor))).toBe("order_rule"); // sin tramos publicados
    await saveTier(db, { productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 1000 }, actor);
    expect((await wholesaleCatalog(db)).rows).toHaveLength(0); // borrador: invisible
    expect(await code(saveRules(db, { ...REGLAS, combine: null }, actor))).toBe("order_rule");
    await publishTiers(db, "storm-sobre", actor);
    expect((await saveRules(db, REGLAS, actor)).open).toBe(true);
    expect((await wholesaleCatalog(db)).rows.map((r) => r.productId)).toEqual(["storm-sobre"]);
  });
});

describe("tramos y escalas", () => {
  it("el tramo que rige es el de mayor cantidad mínima que no supere lo pedido; por debajo del primero, «A cotizar»", () => {
    const t = [{ minQty: 10, unitPriceUsdMinor: 1000 }, { minQty: 50, unitPriceUsdMinor: 800 }];
    expect(tierFor(t, 9)).toBeNull();
    expect(tierFor(t, 10)?.unitPriceUsdMinor).toBe(1000);
    expect(tierFor(t, 49)?.unitPriceUsdMinor).toBe(1000);
    expect(tierFor(t, 50)?.unitPriceUsdMinor).toBe(800);
    expect(tierFor(t, 5000)?.unitPriceUsdMinor).toBe(800);
    expect(tierFor([], 5)).toBeNull();
  });

  it("publicar exige precios que bajen al comprar más; cambiar un tramo publicado lo devuelve a borrador", async () => {
    await saveTier(db, { productId: "storm-sobre", minQty: 10, unitPriceUsdMinor: 800 }, actor);
    await saveTier(db, { productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 1000 }, actor);
    expect(await code(publishTiers(db, "storm-sobre", actor))).toBe("order_rule");
    await saveTier(db, { productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 700 }, actor);
    expect((await publishTiers(db, "storm-sobre", actor)).published).toBe(2);
    await saveTier(db, { productId: "storm-sobre", minQty: 50, unitPriceUsdMinor: 600 }, actor);
    const rows = await db.select().from(wholesaleTiers).orderBy(wholesaleTiers.minQty);
    expect(rows.map((r) => r.state)).toEqual(["publicado", "borrador"]);
    expect(await code(saveTier(db, { productId: "storm-sobre", minQty: 0, unitPriceUsdMinor: 100 }, actor))).toBe("invalid_input");
    expect(await code(saveTier(db, { productId: "no-existe", minQty: 1, unitPriceUsdMinor: 100 }, actor))).toBe("not_found");
    expect((await deleteTier(db, "storm-sobre", 50)).changed).toBe(true);
  });

  it("cotiza en el servidor con la misma conversión del sitio: pesos redondeados a $100, mínimos y combinación", async () => {
    await abrir();
    const { rows, rules, rate10k } = await wholesaleCatalog(db);
    expect(rate10k).toBe(15_000_000);
    const q = quote(rows, rules, [{ productId: "storm-sobre", quantity: 50 }, { productId: "ejemplo-sobre", quantity: 20 }], rate10k);
    expect(q.ok).toBe(true);
    expect(q.lines[0]).toMatchObject({ unitUsdMinor: 800, unitArsMinor: 1_200_000, totalArsMinor: 60_000_000 }); // USD 8 × 1.500 = $12.000
    expect(q.lines[1]).toMatchObject({ unitUsdMinor: 500, unitArsMinor: 750_000 });
    // Por producto: 19 de ejemplo-sobre no llega a su primer tramo → «A cotizar».
    const bajo = quote(rows, rules, [{ productId: "storm-sobre", quantity: 10 }, { productId: "ejemplo-sobre", quantity: 19 }], rate10k);
    expect(bajo.ok).toBe(false);
    expect(bajo.lines[1].status).toBe("a_cotizar");
    // Combinando el pedido, las 29 unidades sí alcanzan el tramo de 20 de ejemplo-sobre.
    const comb = quote(rows, { ...rules, combine: "pedido" }, [{ productId: "storm-sobre", quantity: 10 }, { productId: "ejemplo-sobre", quantity: 19 }], rate10k);
    expect(comb.lines[1]).toMatchObject({ unitUsdMinor: 500, status: "ok" });
    // Mínimo en unidades.
    expect(quote(rows, rules, [{ productId: "storm-sobre", quantity: 9 }], rate10k).problems.join(" ")).toMatch(/mínima es de 10 unidades/);
    // Mínimo por importe.
    expect(quote(rows, { ...rules, minUnits: null, minAmountMinor: 100_000_000 }, [{ productId: "storm-sobre", quantity: 10 }], rate10k).ok).toBe(false);
    // Producto fuera del catálogo mayorista.
    expect(quote(rows, rules, [{ productId: "storm-caja", quantity: 10 }], rate10k).ok).toBe(false);
  });

  it("sin cotización del dólar el precio en pesos queda «A cotizar», nunca $0", async () => {
    await abrir();
    const { rows, rules } = await wholesaleCatalog(db);
    const q = quote(rows, rules, [{ productId: "storm-sobre", quantity: 10 }], null);
    expect(q.lines[0]).toMatchObject({ unitArsMinor: null, totalArsMinor: null, status: "a_cotizar" });
    expect(q.ok).toBe(false);
  });
});

describe("pedido mayorista (siempre por pedido, reutiliza consultas y seguimiento)", () => {
  const body = (over: Record<string, unknown> = {}) => ({ lines: [{ productId: "storm-sobre", quantity: 50 }], contactName: "Ana Pérez", idempotencyKey: key(), ...over });

  it("crea una consulta mayorista con seguimiento «Solicitud recibida», sin descuentos minoristas y sin tocar el stock", async () => {
    await aprobar("ana");
    await abrir();
    const stockAntes = (await loadOverrides(db)).size;
    const r = await createWholesaleOrder(db, "ana", body(), 5000);
    expect(r.replayed).toBe(false);
    const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, r.reference));
    expect(inq).toMatchObject({ orderKind: "mayorista", userId: "ana", discountMinor: 0, comboDiscountMinor: 0, paymentPreference: "mayorista", subtotalMinor: 60_000_000 });
    expect(inq.message).toMatch(/sin descuento adicional/);
    expect(inq.message).not.toMatch(/10% OFF|cuotas/i);
    const [line] = await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, r.reference));
    expect(line).toMatchObject({ fulfillment: "mayorista", quantity: 50, unitPriceMinor: 1_200_000, unitPriceUsdMinor: 800 });
    const v = (await customerOrderView(db, r.reference))!;
    expect(v).toMatchObject({ kind: "mayorista", stage: "solicitud_recibida", agreedMinor: null });
    expect(v.action).toMatch(/no hace falta pagar nada/);
    expect((await loadOverrides(db)).size).toBe(stockAntes); // el stock minorista no se toca ni se reserva
    expect((await db.select().from(productOverrides)).length).toBe(0);
  });

  it("es idempotente: doble clic y reintentos devuelven el mismo pedido; la misma clave con otro contenido, 422", async () => {
    await aprobar("ana");
    await abrir();
    const b = body();
    const [x, y] = await Promise.all([createWholesaleOrder(db, "ana", b, 1), createWholesaleOrder(db, "ana", b, 1)]);
    expect(x.reference).toBe(y.reference);
    expect(await db.select().from(inquiries)).toHaveLength(1);
    expect(await code(createWholesaleOrder(db, "ana", { ...b, lines: [{ productId: "storm-sobre", quantity: 60 }] }, 1))).toBe("idempotency_conflict");
  });

  it("rechaza a quien no está aprobada, un mínimo no alcanzado y datos inválidos; la cuenta ajena no ve el pedido", async () => {
    await abrir();
    expect(await code(createWholesaleOrder(db, "beto", body(), 1))).toBe("forbidden");
    await aprobar("ana");
    expect(await code(createWholesaleOrder(db, "ana", body({ lines: [{ productId: "storm-sobre", quantity: 9 }] }), 1))).toBe("order_rule");
    expect(await code(createWholesaleOrder(db, "ana", body({ lines: [{ productId: "storm-sobre", quantity: 0 }] }), 1))).toBe("invalid_input");
    expect(await code(createWholesaleOrder(db, "ana", body({ lines: [{ productId: "storm-sobre", quantity: 10 }, { productId: "storm-sobre", quantity: 10 }] }), 1))).toBe("invalid_input");
    expect(await code(createWholesaleOrder(db, "ana", body({ contactName: "Ana" }), 1))).toBe("invalid_input");
    const ok = await createWholesaleOrder(db, "ana", body(), 1);
    const [inq] = await db.select().from(inquiries).where(eq(inquiries.id, ok.reference));
    const [t] = await db.select().from(orderTracks).where(eq(orderTracks.inquiryId, ok.reference));
    expect(canView(inq, t, { userId: "ana" })).toBe(true);
    expect(canView(inq, t, { userId: "beto" })).toBe(false);
    expect(canView(inq, t, { sessionTokenHash: hashToken("cualquiera") })).toBe(false);
    // Si se cierra el catálogo, ya no se puede pedir.
    await saveRules(db, { ...REGLAS, open: false }, actor);
    expect(await code(createWholesaleOrder(db, "ana", body(), 1))).toBe("forbidden");
  });

  it("las reglas vacías vuelven a «sin definir» y no se inventan valores", async () => {
    const r = await getRules(db);
    expect(r).toEqual({ minUnits: null, minAmountMinor: null, combine: null, delayText: null, delayFrom: null, open: false });
  });
});
