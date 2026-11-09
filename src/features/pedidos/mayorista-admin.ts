import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import type { Tx } from "@/db/lock";
import { inquirySales, orderTracks, saleCommissions, sales, wholesaleOrderCosts } from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { SaleError } from "@/features/sales/errors";
import { trackLock } from "./service";

export { costUsdEquivalent, orderUsdEquivalent } from "./mayorista-costos";

const positive = z.number().int().positive().max(1_000_000_000_000);
const costInput = z.object({
  category: z.enum(["mercaderia", "envio", "aduana", "comision", "otro"]),
  currency: z.enum(["ARS", "USD"]),
  amountMinor: z.number().int().nonnegative().max(1_000_000_000_000),
  exchangeRateMinor: positive.optional(),
  paidAt: z.number().int().positive().max(8_640_000_000_000_000).optional(),
  note: z.string().trim().max(400).optional(),
  idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{16,100}$/),
});
const voidInput = z.object({ costId: z.string().min(1).max(100), reason: z.string().trim().min(3).max(300) });
const guideInput = z.object({
  carrier: z.string().trim().max(80).nullable(),
  trackingNumber: z.string().trim().max(100).nullable(),
}).refine((value) => Boolean(value.carrier) === Boolean(value.trackingNumber), "Completá el transportista y la guía, o vaciá ambos para retirarla.");

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SaleError(400, "invalid_input", result.error.issues[0]?.message ?? "Revisá los datos.");
  return result.data;
}

async function lockWholesale(tx: Tx, inquiryId: string) {
  await trackLock(tx, inquiryId);
  const [row] = await tx.select().from(orderTracks).where(eq(orderTracks.inquiryId, inquiryId));
  if (row?.kind !== "mayorista") throw new SaleError(404, "not_found", "Pedido mayorista no encontrado.");
}

export function listWholesaleOrderCosts(db: Db, inquiryId: string) {
  return db.select().from(wholesaleOrderCosts).where(eq(wholesaleOrderCosts.inquiryId, inquiryId))
    .orderBy(desc(wholesaleOrderCosts.paidAt), desc(wholesaleOrderCosts.createdAt));
}

export async function linkedSaleCommission(db: Db, inquiryId: string) {
  const [row] = await db.select({ total: sql<string>`coalesce(sum(${saleCommissions.amountMinor}), 0)` })
    .from(inquirySales).innerJoin(sales, eq(inquirySales.saleId, sales.id))
    .innerJoin(saleCommissions, eq(saleCommissions.saleId, sales.id))
    .where(and(eq(inquirySales.inquiryId, inquiryId), eq(inquirySales.active, true), eq(sales.status, "registrada")));
  return Number(row.total);
}

export async function addWholesaleCost(db: Db, inquiryId: string, raw: unknown, actor: Actor, now = Date.now()) {
  const input = parse(costInput, raw);
  const paidAt = input.paidAt ?? now;
  if (paidAt > now + 86_400_000) throw new SaleError(400, "invalid_input", "Cargá la fecha real del gasto.");
  const rate = input.exchangeRateMinor ?? null;
  const arsMinor = input.currency === "ARS" ? input.amountMinor : rate
    ? Number((BigInt(input.amountMinor) * BigInt(rate) + BigInt(50)) / BigInt(100))
    : null;
  if (arsMinor !== null && (!Number.isSafeInteger(arsMinor) || arsMinor > 1_000_000_000_000)) {
    throw new SaleError(400, "invalid_input", "El equivalente en pesos está fuera del rango permitido.");
  }
  const id = `${inquiryId}:${input.idempotencyKey}`;
  return db.transaction(async (tx) => {
    await lockWholesale(tx, inquiryId);
    const rows = await tx.insert(wholesaleOrderCosts).values({
      id, inquiryId, category: input.category, currency: input.currency,
      amountMinor: input.amountMinor, arsMinor, exchangeRateMinor: rate,
      paidAt, note: input.note || null, createdAt: now, createdByEmail: actor.email,
    }).onConflictDoNothing().returning({ id: wholesaleOrderCosts.id });
    return { replayed: rows.length === 0 };
  });
}

export async function voidWholesaleCost(db: Db, inquiryId: string, raw: unknown, actor: Actor, now = Date.now()) {
  const input = parse(voidInput, raw);
  return db.transaction(async (tx) => {
    await lockWholesale(tx, inquiryId);
    const where = and(eq(wholesaleOrderCosts.id, input.costId), eq(wholesaleOrderCosts.inquiryId, inquiryId));
    const [row] = await tx.select().from(wholesaleOrderCosts).where(where);
    if (!row) throw new SaleError(404, "not_found", "Gasto no encontrado en este pedido.");
    if (row.voidedAt !== null) return { replayed: true };
    await tx.update(wholesaleOrderCosts).set({ voidedAt: now, voidReason: input.reason, voidedByEmail: actor.email }).where(where);
    return { replayed: false };
  });
}

export async function setWholesaleGuide(db: Db, inquiryId: string, raw: unknown, now = Date.now()) {
  const input = parse(guideInput, raw);
  return db.transaction(async (tx) => {
    await lockWholesale(tx, inquiryId);
    await tx.update(orderTracks).set({
      customerCarrier: input.carrier || null,
      customerTrackingNumber: input.trackingNumber || null,
      updatedAt: now,
    }).where(eq(orderTracks.inquiryId, inquiryId));
    return { saved: true };
  });
}
