import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { catalog } from "@/content/catalog";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { inquiries, inquiryEvents, inquiryLines, orderEvents, orderTracks } from "@/db/schema";
import type { Actor } from "@/features/catalog/overrides";
import { toRate10k, usdToArsMinor } from "@/features/fx/convert";
import { getEffectiveRate } from "@/features/fx/service";
import { newReference } from "@/features/inquiries/service";
import { SaleError } from "@/features/sales/errors";
import { ensureTrack, sha, trackLock } from "./service";

const contact = z.object({
  contactName: z.string().trim().min(2, "Completá el nombre del cliente.").max(100),
  contactPhone: z.string().trim().max(24).nullish().transform((value) => value || null)
    .refine((value) => value === null || (/^[0-9+()\-\s]+$/.test(value) && value.replace(/\D/g, "").length >= 6), "Ingresá un teléfono válido."),
});
const createSchema = contact.extend({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  amountUsdMinor: z.number().int().positive().max(100_000_000).nullable(),
  rateMinor: z.number().int().positive().max(100_000_000).nullable(),
  note: z.string().trim().max(500).nullable(),
  lines: z.array(z.object({ productId: z.string().min(1).max(80), quantity: z.number().int().min(1).max(999) })).min(1, "Agregá al menos un producto.").max(30),
});

function parse<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) throw new SaleError(400, "invalid_input", result.error.issues[0]?.message ?? "Revisá los datos.");
  return result.data;
}

export async function createManualWholesaleOrder(db: Db, body: unknown, actor: Actor, now = Date.now()) {
  const input = parse(createSchema, body);
  const products = new Map(catalog.products.filter((p) => !p.retired && !p.addonOnly).map((p) => [p.id, p]));
  const ids = input.lines.map((line) => line.productId);
  if (new Set(ids).size !== ids.length || ids.some((id) => !products.has(id))) throw new SaleError(400, "invalid_input", "Revisá los productos. Cada uno debe aparecer una sola vez.");
  const key = `mayorista-manual-${input.idempotencyKey}`;
  const hash = sha(JSON.stringify(input));
  const effective = input.rateMinor === null ? await getEffectiveRate(db, now) : null;
  const rate = input.rateMinor === null ? effective?.rate10k ?? null : toRate10k(input.rateMinor / 100);
  if (input.rateMinor !== null && rate === null) throw new SaleError(400, "invalid_input", "La cotización por dólar no es válida.");
  const agreedMinor = input.amountUsdMinor !== null && rate !== null ? usdToArsMinor(input.amountUsdMinor, rate) : null;
  return db.transaction(async (tx) => {
    await lockKey(tx, `wholesale-order:${key}`);
    const [existing] = await tx.select({ id: inquiries.id, hash: inquiries.contentHash }).from(inquiries).where(eq(inquiries.idempotencyKey, key));
    if (existing) {
      if (existing.hash !== hash) throw new SaleError(422, "idempotency_conflict", "Esa operación ya registró otro pedido.");
      return { reference: existing.id, replayed: true };
    }
    if (input.amountUsdMinor !== null && (agreedMinor === null || agreedMinor > 100_000_000_000)) throw new SaleError(400, "invalid_input", "Para guardar ese importe en USD ingresá una cotización válida.");
    const reference = newReference();
    await tx.insert(inquiries).values({
      id: reference, idempotencyKey: key, contentHash: hash, sessionTokenHash: sha(randomBytes(24).toString("hex")),
      status: "consulta_mayorista", orderKind: "mayorista", source: "manual", currency: "ARS", subtotalMinor: 0,
      fxRate10k: rate, fxAsOf: input.rateMinor === null ? effective?.asOf : now, fxMode: input.rateMinor === null ? effective?.mode : "manual",
      deliveryMethod: "a_coordinar", deliveryJson: JSON.stringify({ method: "a_coordinar" }), paymentPreference: "mayorista",
      contactName: input.contactName, contactPhone: input.contactPhone, contactConfirmedAt: now,
      message: "Pedido mayorista registrado por el dueño.", createdAt: now,
    });
    await tx.insert(inquiryLines).values(input.lines.map(({ productId, quantity }) => {
      const p = products.get(productId)!;
      return { inquiryId: reference, productId, sku: p.sku, title: p.title, language: p.language, quantity, fulfillment: "mayorista", unitPriceMinor: 0, lineSubtotalMinor: 0 };
    }));
    await tx.insert(inquiryEvents).values({ inquiryId: reference, kind: "created", detail: "Pedido mayorista cargado a mano.", actorEmail: actor.email, createdAt: now });
    await trackLock(tx, reference);
    await ensureTrack(tx, reference, now, { agreedMinor });
    if (input.amountUsdMinor !== null) await tx.update(orderTracks).set({ agreedUsdMinor: input.amountUsdMinor }).where(eq(orderTracks.inquiryId, reference));
    if (input.note) await tx.insert(orderEvents).values({ inquiryId: reference, kind: "note", internalText: input.note, occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { reference, replayed: false };
  });
}

export async function updateWholesaleContact(db: Db, reference: string, body: unknown, actor: Actor, now = Date.now()) {
  const input = parse(contact, body);
  return db.transaction(async (tx) => {
    await trackLock(tx, reference);
    const [row] = await tx.select({ kind: inquiries.orderKind, name: inquiries.contactName, phone: inquiries.contactPhone }).from(inquiries).where(eq(inquiries.id, reference));
    if (row?.kind !== "mayorista") throw new SaleError(404, "not_found", "Pedido mayorista no encontrado.");
    if (row.name === input.contactName && row.phone === input.contactPhone) return { changed: false };
    await tx.update(inquiries).set(input).where(eq(inquiries.id, reference));
    await tx.insert(orderEvents).values({ inquiryId: reference, kind: "note", internalText: "Se actualizó el contacto del pedido.", occurredAt: now, createdAt: now, actorEmail: actor.email });
    return { changed: true };
  });
}
