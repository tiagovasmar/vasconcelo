import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey, type Tx } from "@/db/lock";
import {
  appliedCosts, costExpenses, costExpenseShares, costPurchaseItems, costPurchases, inquiries, inquiryLines, inquirySales, orderPayments, orderRefunds, orderTracks, saleCommissions, saleLines, sales,
} from "@/db/schema";
import { catalog } from "@/content/catalog";
import type { Actor } from "@/features/catalog/overrides";
import { SaleError, type SaleErrorCode } from "@/features/sales/errors";
import { RATE_SCALE } from "@/features/fx/convert";

/**
 * Costos PRIVADOS (solo panel). Nada de este módulo se importa desde páginas públicas ni rutas de clientes.
 *
 * Método (visible y verificable):
 *  - costo de un artículo = precio original × cantidad × cotización usada (BigInt, redondeo al centavo) + su parte de los gastos compartidos;
 *  - cada gasto compartido (envío, impuestos, otros) tiene una REGLA de reparto elegida por el dueño: por unidades, por valor o manual (debe sumar el gasto);
 *    se reparte en centavos exactos (método del mayor resto, desempate por orden del artículo) y el reparto queda guardado fila por fila; nunca hay un reparto silencioso;
 *  - al confirmar la compra los costos se congelan;
 *  - el costo que se aplica a una venta es el PROMEDIO de las compras confirmadas al momento de la venta (costo promedio ponderado) y se guarda en la propia venta:
 *    una reposición o un cambio de cotización posterior no modifica la ganancia ya calculada;
 *  - sin compras confirmadas del producto: «Costo pendiente». Nunca se asume cero.
 */
const fail = (status: number, code: SaleErrorCode, message: string, details?: unknown): never => { throw new SaleError(status, code, message, details); };
function parseOr400<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) return fail(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.", r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  return r.data;
}
const KEY = z.string().min(16, "Falta la clave de la operación.").max(64).regex(/^[A-Za-z0-9_-]+$/, "La clave de la operación no es válida.");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** División entera redondeada (mitades hacia arriba) con BigInt. */
export const divRound = (num: bigint, den: bigint): number => Number((num * 2n + den) / (den * 2n));

/** Reparte `total` (centavos) entre `weights` en proporción, con el método del mayor resto: la suma es EXACTA y el resultado es determinista. */
export function allocateProportional(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  if (sum <= 0) return fail(400, "invalid_input", "No hay base para repartir el gasto (cantidades o valores en cero).");
  const base = weights.map((w) => Math.floor((total * w) / sum));
  let rest = total - base.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ i, frac: (total * w) % sum })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const o of order) { if (rest <= 0) break; base[o.i] += 1; rest--; }
  return base;
}

export const CURRENCIES = ["RMB", "USD", "ARS"] as const;
const PRICE_ORIG = z.number({ error: "Escribí el precio unitario." }).int("El precio debe estar en centavos enteros.").min(1, "El precio debe ser mayor que cero.").max(1_000_000_000_00);

export const PurchaseSchema = z.object({
  supplier: z.string().trim().min(2, "Escribí el proveedor.").max(80),
  purchasedAt: z.number().int().positive().max(4_102_444_800_000),
  currency: z.enum(CURRENCIES, { error: "Elegí la moneda del precio original." }),
  /** Pesos por unidad de la moneda × 10.000 (obligatorio si no es ARS). */
  rateToArs10k: z.number().int().min(1).max(1_000_000 * RATE_SCALE).nullish().transform((v) => v ?? null),
  rateNote: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)),
  note: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
  items: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1, "La cantidad mínima es 1.").max(1_000_000), unitPriceOriginalMinor: PRICE_ORIG })).min(1, "Agregá al menos un producto.").max(100),
  expenses: z.array(z.object({
    kind: z.enum(["envio", "impuestos", "otros"], { error: "Elegí el tipo de gasto." }),
    description: z.string().trim().max(120).nullish().transform((v) => (v ? v : null)),
    amountMinor: z.number().int().min(0).max(1_000_000_000_00),
    allocation: z.enum(["unidades", "valor", "manual"], { error: "Elegí la regla de reparto del gasto." }),
    /** Solo manual: centavos por posición de artículo (0-based). */
    manual: z.record(z.string(), z.number().int().min(0)).nullish().transform((v) => v ?? null),
  })).max(20).default([]),
  idempotencyKey: KEY,
}).refine((v) => v.currency === "ARS" || v.rateToArs10k !== null, { message: "Cargá la cotización usada para convertir a pesos.", path: ["rateToArs10k"] });

export type PurchaseInput = z.input<typeof PurchaseSchema>;
const purchaseId = (key: string) => `CO-${sha(key).slice(0, 10).toUpperCase()}`;

/** Crea la compra en BORRADOR (idempotente por clave). Los costos finales se calculan al confirmar. */
export async function createPurchase(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ id: string; replayed: boolean }> {
  const v = parseOr400(PurchaseSchema, body);
  const unknown = v.items.find((i) => !catalog.products.some((p) => p.id === i.productId));
  if (unknown) return fail(400, "invalid_input", "Hay productos que no existen en el catálogo.");
  const id = purchaseId(v.idempotencyKey);
  return db.transaction(async (tx) => {
    await lockKey(tx, `cost-purchase:${id}`);
    const [again] = await tx.select().from(costPurchases).where(eq(costPurchases.id, id));
    if (again) return { id, replayed: true };
    await tx.insert(costPurchases).values({ id, supplier: v.supplier, purchasedAt: v.purchasedAt, currency: v.currency, rateToArs10k: v.currency === "ARS" ? null : v.rateToArs10k, rateNote: v.rateNote, note: v.note, status: "borrador", createdAt: now, createdByEmail: actor.email });
    await tx.insert(costPurchaseItems).values(v.items.map((i) => ({ purchaseId: id, productId: i.productId, quantity: i.quantity, unitPriceOriginalMinor: i.unitPriceOriginalMinor })));
    if (v.expenses.length) {
      for (const e of v.expenses) {
        if (e.allocation === "manual") {
          const m = e.manual ?? {};
          const total = Object.values(m).reduce((a, b) => a + b, 0);
          if (total !== e.amountMinor) return fail(400, "invalid_input", `El reparto manual del gasto «${e.kind}» suma ${total} y el gasto es ${e.amountMinor}: tiene que coincidir.`);
          if (Object.keys(m).some((k) => !(Number.isInteger(Number(k)) && Number(k) >= 0 && Number(k) < v.items.length))) return fail(400, "invalid_input", "El reparto manual apunta a un artículo que no existe.");
        }
      }
      await tx.insert(costExpenses).values(v.expenses.map((e) => ({ purchaseId: id, kind: e.kind, description: e.description, amountMinor: e.amountMinor, allocation: e.allocation, manualJson: e.allocation === "manual" ? JSON.stringify(e.manual ?? {}) : null })));
    }
    return { id, replayed: false };
  });
}

/** Costo de un artículo en pesos SIN gastos: precio original × cantidad × cotización (exacto, BigInt). */
export function itemBaseCostMinor(p: { currency: string; rateToArs10k: number | null }, unitPriceOriginalMinor: number, quantity: number): number {
  if (p.currency === "ARS") return unitPriceOriginalMinor * quantity;
  return divRound(BigInt(unitPriceOriginalMinor) * BigInt(quantity) * BigInt(p.rateToArs10k ?? 0), BigInt(RATE_SCALE));
}

/** Confirma la compra: calcula y congela el reparto de gastos, el costo total y el costo final por unidad. Idempotente (confirmar dos veces no recalcula). */
export async function confirmPurchase(db: Db, id: string, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  void actor;
  return db.transaction(async (tx) => {
    await lockKey(tx, `cost-purchase:${id}`);
    const [p] = await tx.select().from(costPurchases).where(eq(costPurchases.id, id));
    if (!p) return fail(404, "not_found", "La compra no existe.");
    if (p.status === "confirmada") return { changed: false };
    const items = await tx.select().from(costPurchaseItems).where(eq(costPurchaseItems.purchaseId, id)).orderBy(costPurchaseItems.id);
    const exps = await tx.select().from(costExpenses).where(eq(costExpenses.purchaseId, id)).orderBy(costExpenses.id);
    const base = items.map((i) => itemBaseCostMinor(p, i.unitPriceOriginalMinor, i.quantity));
    const allocated = items.map(() => 0);
    for (const e of exps) {
      const weights = e.allocation === "unidades" ? items.map((i) => i.quantity) : e.allocation === "valor" ? base : items.map((_, idx) => (JSON.parse(e.manualJson ?? "{}") as Record<string, number>)[String(idx)] ?? 0);
      const shares = e.allocation === "manual" ? weights : allocateProportional(e.amountMinor, weights);
      if (shares.reduce((a, b) => a + b, 0) !== e.amountMinor) return fail(409, "order_rule", "El reparto de un gasto no suma su importe.");
      for (let k = 0; k < items.length; k++) {
        allocated[k] += shares[k];
        await tx.insert(costExpenseShares).values({ expenseId: e.id, itemId: items[k].id, shareMinor: shares[k] });
      }
    }
    for (let k = 0; k < items.length; k++) {
      const total = base[k] + allocated[k];
      await tx.update(costPurchaseItems).set({ allocatedExpensesMinor: allocated[k], totalCostMinor: total, finalUnitCostMinor: divRound(BigInt(total), BigInt(items[k].quantity)) }).where(eq(costPurchaseItems.id, items[k].id));
    }
    await tx.update(costPurchases).set({ status: "confirmada", confirmedAt: now }).where(eq(costPurchases.id, id));
    return { changed: true };
  });
}

type Q = Db | Tx;

/** Costo promedio ponderado (centavos de ARS por unidad) de las compras CONFIRMADAS de un producto; null = «Costo pendiente». */
export async function averageCosts(q: Q, productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await q.select({ productId: costPurchaseItems.productId, total: sql<string>`sum(${costPurchaseItems.totalCostMinor})`, qty: sql<string>`sum(${costPurchaseItems.quantity})` })
    .from(costPurchaseItems).innerJoin(costPurchases, eq(costPurchases.id, costPurchaseItems.purchaseId)).where(and(eq(costPurchases.status, "confirmada"), inArray(costPurchaseItems.productId, productIds))).groupBy(costPurchaseItems.productId);
  return new Map(rows.filter((r) => Number(r.qty) > 0).map((r) => [r.productId, divRound(BigInt(r.total), BigInt(r.qty))]));
}

/** Congela el costo de cada línea de una venta recién registrada (dentro de la misma transacción de la venta). Las líneas sin costo conocido quedan «pendiente». */
export async function snapshotSaleCosts(tx: Tx, saleId: string, now: number): Promise<number> {
  const lines = await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId));
  const avg = await averageCosts(tx, [...new Set(lines.map((l) => l.productId))]);
  let n = 0;
  for (const l of lines) {
    const c = avg.get(l.productId);
    if (c === undefined) continue;
    const r = await tx.insert(appliedCosts).values({ refKind: "sale_line", refId: l.id, unitCostMinor: c, basis: "promedio_compras", createdAt: now }).onConflictDoNothing().returning({ id: appliedCosts.id });
    n += r.length;
  }
  return n;
}

export const ApplyCostSchema = z.object({
  refKind: z.enum(["sale_line", "order_line"]),
  refId: z.number().int().positive(),
  /** Si falta, se usa el costo promedio actual; si tampoco existe, se rechaza (no se asume cero). */
  unitCostMinor: z.number().int().min(1, "El costo debe ser mayor que cero.").max(1_000_000_000_00).optional(),
});

/** Completa el costo de una línea que quedó «pendiente» (venta anterior a las compras, o línea de un pedido). Una vez aplicado NO se modifica. */
export async function applyLineCost(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ unitCostMinor: number; basis: string; changed: boolean }> {
  const v = parseOr400(ApplyCostSchema, body);
  return db.transaction(async (tx) => {
    await lockKey(tx, `applied-cost:${v.refKind}:${v.refId}`);
    const [have] = await tx.select().from(appliedCosts).where(and(eq(appliedCosts.refKind, v.refKind), eq(appliedCosts.refId, v.refId)));
    if (have) return { unitCostMinor: have.unitCostMinor, basis: have.basis, changed: false };
    const productId = v.refKind === "sale_line" ? (await tx.select({ p: saleLines.productId }).from(saleLines).where(eq(saleLines.id, v.refId)))[0]?.p : (await tx.select({ p: inquiryLines.productId }).from(inquiryLines).where(eq(inquiryLines.id, v.refId)))[0]?.p;
    if (!productId) return fail(404, "not_found", "La línea no existe.");
    const avg = (await averageCosts(tx, [productId])).get(productId);
    const cost = v.unitCostMinor ?? avg;
    if (cost === undefined) return fail(409, "order_rule", "Costo pendiente: todavía no hay una compra confirmada de este producto. Cargá el costo a mano o registrá la compra.");
    await tx.insert(appliedCosts).values({ refKind: v.refKind, refId: v.refId, unitCostMinor: cost, basis: v.unitCostMinor !== undefined ? "manual" : "promedio_compras", createdAt: now, createdByEmail: actor.email });
    return { unitCostMinor: cost, basis: v.unitCostMinor !== undefined ? "manual" : "promedio_compras", changed: true };
  });
}

export const CommissionSchema = z.object({ saleId: z.string().min(1).max(40), amountMinor: z.number().int().min(1, "El importe debe ser mayor que cero.").max(1_000_000_000_00), note: z.string().trim().max(200).nullish().transform((v) => (v ? v : null)), idempotencyKey: KEY });
export async function addCommission(db: Db, body: unknown, actor: Actor, now = Date.now()): Promise<{ replayed: boolean }> {
  const v = parseOr400(CommissionSchema, body);
  const [s] = await db.select({ id: sales.id }).from(sales).where(eq(sales.id, v.saleId));
  if (!s) return fail(404, "not_found", "La venta no existe.");
  const rows = await db.insert(saleCommissions).values({ saleId: v.saleId, amountMinor: v.amountMinor, note: v.note, idempotencyKey: v.idempotencyKey, createdAt: now, createdByEmail: actor.email }).onConflictDoNothing({ target: saleCommissions.idempotencyKey }).returning({ id: saleCommissions.id });
  return { replayed: rows.length === 0 };
}

/* ---------- Informe de ganancia ---------- */

export type ProfitRow = {
  kind: "venta" | "pedido"; ref: string; at: number; label: string;
  /** Importe de venta (lo cobrado/acordado, ya con descuentos). */
  revenueMinor: number; grossMinor: number; discountMinor: number;
  costMinor: number | null; costPending: boolean; commissionMinor: number;
  /** Dinero efectivamente cobrado según los pagos confirmados menos lo reintegrado; null = sin registro de cobro. */
  collectedMinor: number | null;
  profitMinor: number | null;
};
export type ProfitReport = { rows: ProfitRow[]; totals: { billedMinor: number; collectedMinor: number; costMinor: number; commissionMinor: number; profitMinor: number; discountMinor: number; pendingCostRows: number } };

export async function profitReport(db: Db, f: { from?: number; to?: number } = {}): Promise<ProfitReport> {
  const saleRows = await db.select().from(sales).where(and(eq(sales.status, "registrada"), f.from !== undefined ? gte(sales.createdAt, f.from) : undefined, f.to !== undefined ? lt(sales.createdAt, f.to) : undefined)).orderBy(desc(sales.createdAt));
  const rows: ProfitRow[] = [];
  const saleIds = saleRows.map((s) => s.id);
  const lines = saleIds.length ? await db.select().from(saleLines).where(inArray(saleLines.saleId, saleIds)) : [];
  const costs = lines.length ? await db.select().from(appliedCosts).where(and(eq(appliedCosts.refKind, "sale_line"), inArray(appliedCosts.refId, lines.map((l) => l.id)))) : [];
  const comm = saleIds.length ? await db.select({ saleId: saleCommissions.saleId, n: sql<string>`sum(${saleCommissions.amountMinor})` }).from(saleCommissions).where(inArray(saleCommissions.saleId, saleIds)).groupBy(saleCommissions.saleId) : [];
  const links = saleIds.length ? await db.select().from(inquirySales).where(and(inArray(inquirySales.saleId, saleIds), eq(inquirySales.active, true))) : [];
  const collectedFor = async (inquiryId: string): Promise<number | null> => {
    const [p] = await db.select({ n: sql<string>`coalesce(sum(${orderPayments.amountMinor}), 0)` }).from(orderPayments).where(and(eq(orderPayments.inquiryId, inquiryId), eq(orderPayments.status, "confirmado")));
    const [r] = await db.select({ n: sql<string>`coalesce(sum(${orderRefunds.amountMinor}), 0)` }).from(orderRefunds).where(and(eq(orderRefunds.inquiryId, inquiryId), eq(orderRefunds.status, "reintegrado")));
    const net = Number(p.n) - Number(r.n);
    return Number(p.n) === 0 ? null : net;
  };
  for (const s of saleRows) {
    const ls = lines.filter((l) => l.saleId === s.id);
    const gross = ls.reduce((n, l) => n + l.unitPriceMinor * l.quantity, 0);
    const discount = ls.reduce((n, l) => n + l.discountMinor, 0);
    const known = ls.map((l) => costs.find((c) => c.refId === l.id));
    const pending = known.some((c) => !c);
    const cost = pending ? null : ls.reduce((n, l, i) => n + known[i]!.unitCostMinor * l.quantity, 0);
    const commission = Number(comm.find((c) => c.saleId === s.id)?.n ?? 0);
    const link = links.find((l) => l.saleId === s.id);
    rows.push({ kind: "venta", ref: s.id, at: s.createdAt, label: ls.map((l) => `${l.quantity} × ${l.title}`).join(", "), revenueMinor: s.totalMinor, grossMinor: gross, discountMinor: discount, costMinor: cost, costPending: pending, commissionMinor: commission, collectedMinor: link ? await collectedFor(link.inquiryId) : null, profitMinor: cost === null ? null : s.totalMinor - cost - commission });
  }
  // Encargos y mayoristas: ingreso = importe acordado; se excluyen los que ya figuran como venta de stock (no se cuentan dos veces).
  const orders = await db.select({ t: orderTracks, name: inquiries.contactName }).from(orderTracks).innerJoin(inquiries, eq(inquiries.id, orderTracks.inquiryId))
    .where(and(inArray(orderTracks.kind, ["encargo", "mayorista"]), sql`${orderTracks.cancelledAt} is null`, sql`${orderTracks.agreedMinor} is not null`, f.from !== undefined ? gte(orderTracks.createdAt, f.from) : undefined, f.to !== undefined ? lt(orderTracks.createdAt, f.to) : undefined));
  for (const { t, name } of orders) {
    const [active] = await db.select({ id: inquirySales.id }).from(inquirySales).where(and(eq(inquirySales.inquiryId, t.inquiryId), eq(inquirySales.active, true)));
    if (active) continue;
    const ls = await db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, t.inquiryId));
    const cs = ls.length ? await db.select().from(appliedCosts).where(and(eq(appliedCosts.refKind, "order_line"), inArray(appliedCosts.refId, ls.map((l) => l.id)))) : [];
    const pending = ls.some((l) => !cs.some((c) => c.refId === l.id));
    const cost = pending ? null : ls.reduce((n, l) => n + cs.find((c) => c.refId === l.id)!.unitCostMinor * l.quantity, 0);
    rows.push({ kind: "pedido", ref: t.inquiryId, at: t.createdAt, label: `${t.kind === "mayorista" ? "Mayorista" : "Encargo"}${name ? ` · ${name}` : ""}`, revenueMinor: t.agreedMinor!, grossMinor: t.agreedMinor!, discountMinor: 0, costMinor: cost, costPending: pending, commissionMinor: 0, collectedMinor: await collectedFor(t.inquiryId), profitMinor: cost === null ? null : t.agreedMinor! - cost });
  }
  rows.sort((a, b) => b.at - a.at);
  const totals = {
    billedMinor: rows.reduce((n, r) => n + r.revenueMinor, 0),
    collectedMinor: rows.reduce((n, r) => n + (r.collectedMinor ?? 0), 0),
    costMinor: rows.reduce((n, r) => n + (r.costMinor ?? 0), 0),
    commissionMinor: rows.reduce((n, r) => n + r.commissionMinor, 0),
    // La ganancia total suma SOLO operaciones con costo conocido; las pendientes se cuentan aparte (no se asumen costo cero).
    profitMinor: rows.reduce((n, r) => n + (r.profitMinor ?? 0), 0),
    discountMinor: rows.reduce((n, r) => n + r.discountMinor, 0),
    pendingCostRows: rows.filter((r) => r.costPending).length,
  };
  return { rows, totals };
}

export async function listPurchases(db: Db) {
  const ps = await db.select().from(costPurchases).orderBy(desc(costPurchases.purchasedAt));
  if (!ps.length) return [];
  const items = await db.select().from(costPurchaseItems).where(inArray(costPurchaseItems.purchaseId, ps.map((p) => p.id))).orderBy(costPurchaseItems.id);
  const exps = await db.select().from(costExpenses).where(inArray(costExpenses.purchaseId, ps.map((p) => p.id))).orderBy(costExpenses.id);
  const shares = exps.length ? await db.select().from(costExpenseShares).where(inArray(costExpenseShares.expenseId, exps.map((e) => e.id))) : [];
  return ps.map((p) => ({ ...p, items: items.filter((i) => i.purchaseId === p.id), expenses: exps.filter((e) => e.purchaseId === p.id).map((e) => ({ ...e, shares: shares.filter((s) => s.expenseId === e.id) })) }));
}
