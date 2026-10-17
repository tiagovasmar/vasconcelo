import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { inquiries, inquiryEvents, inquiryLines, inquirySales, sales, user } from "@/db/schema";
import { catalog } from "@/content/catalog";
import { paymentMethods } from "@/content/checkout-options";
import type { Actor } from "@/features/catalog/overrides";
import { newReference } from "@/features/inquiries/service";
import { isFullName, normalizeName } from "@/features/inquiries/schemas";
import { SaleError } from "@/features/sales/errors";

/**
 * Gestión de consultas del dueño (/admin/consultas). Reglas:
 *  - La consulta ORIGINAL nunca se reescribe: líneas, importes, cotización y mensaje son una copia del momento en que se confirmó el pedido.
 *    Lo que el dueño gestiona vive aparte: estado, contacto confirmado, motivo y notas (historial de eventos que no se edita ni se borra).
 *  - «Consulta generada» (se guardó antes de abrir WhatsApp) ≠ «Contacto confirmado» (lo marca el dueño a mano). Abrir WhatsApp no demuestra que el mensaje se envió.
 *  - Cambiar de estado NO reserva ni descuenta stock. Solo una venta confirmada (sales/service.ts) lo mueve.
 *  - «Convertida en venta» solo se alcanza registrando o vinculando una venta, y se abandona anulándola (el vínculo vive en `inquiry_sales`).
 */
export const CRM_STATUSES = ["pendiente", "en_seguimiento", "convertida", "no_concretada"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];
export const crmLabel: Record<CrmStatus, string> = { pendiente: "Pendiente", en_seguimiento: "En seguimiento", convertida: "Convertida en venta", no_concretada: "No concretada" };

export const CHANNELS = { whatsapp: "WhatsApp directo", instagram: "Instagram", facebook: "Facebook", telefono: "Llamada", presencial: "En persona", otro: "Otro medio" } as const;

/** Argentina no usa horario de verano: UTC-3 fijo. Un día "AAAA-MM-DD" va de 00:00 a 24:00 hora argentina. */
export function dayStart(ymd: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  const t = Date.parse(`${ymd}T00:00:00-03:00`);
  return Number.isFinite(t) ? t : undefined;
}
export const dayEndExclusive = (ymd: string): number | undefined => {
  const s = dayStart(ymd);
  return s === undefined ? undefined : s + 24 * 3600 * 1000;
};

export type InquiryFilters = { q?: string; from?: string; to?: string; status?: CrmStatus | ""; contact?: "confirmado" | "sin_confirmar" | ""; source?: "web" | "manual" | ""; limit?: number; offset?: number };

const likeEsc = (s: string) => s.replace(/[%_\\]/g, "\\$&");

function periodWhere(f: Pick<InquiryFilters, "from" | "to">) {
  return { from: f.from ? dayStart(f.from) : undefined, to: f.to ? dayEndExclusive(f.to) : undefined };
}

function filterWhere(f: InquiryFilters) {
  const { from, to } = periodWhere(f);
  const q = (f.q ?? "").trim().slice(0, 80);
  const digits = q.replace(/\D/g, "");
  // Sin distinguir mayúsculas ni tildes (como el buscador de productos del panel).
  const folded = q.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const like = `%${likeEsc(folded)}%`;
  const fold = (col: unknown) => sql`lower(translate(coalesce(${col}, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))`;
  const search = q
    ? sql`(${inquiries.id} ilike ${like} or ${fold(inquiries.contactName)} like ${like} or ${fold(user.name)} like ${like} or ${fold(user.email)} like ${like} or ${inquiries.contactPhone} ilike ${like}${digits.length >= 3 ? sql` or regexp_replace(coalesce(${inquiries.contactPhone}, ''), '\\D', '', 'g') like ${`%${digits}%`}` : sql``})`
    : undefined;
  return and(
    from !== undefined ? gte(inquiries.createdAt, from) : undefined,
    to !== undefined ? lt(inquiries.createdAt, to) : undefined,
    f.status ? eq(inquiries.crmStatus, f.status) : undefined,
    f.contact === "confirmado" ? sql`${inquiries.contactConfirmedAt} is not null` : f.contact === "sin_confirmar" ? sql`${inquiries.contactConfirmedAt} is null` : undefined,
    f.source ? eq(inquiries.source, f.source) : undefined,
    search,
  );
}

export type InquiryListRow = {
  id: string; createdAt: number; source: string; crmStatus: CrmStatus; contactConfirmedAt: number | null;
  name: string | null; accountEmail: string | null; phone: string | null; units: number; lineCount: number; encargoLines: number; subtotalMinor: number; discountMinor: number;
  saleId: string | null;
};

export async function listInquiries(db: Db, f: InquiryFilters = {}): Promise<{ rows: InquiryListRow[]; total: number }> {
  const where = filterWhere(f);
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(inquiries).leftJoin(user, eq(user.id, inquiries.userId)).where(where);
  const rows = await db
    .select({ i: inquiries, accountName: user.name, accountEmail: user.email })
    .from(inquiries).leftJoin(user, eq(user.id, inquiries.userId)).where(where)
    .orderBy(desc(inquiries.createdAt), desc(inquiries.id)).limit(limit).offset(Math.max(f.offset ?? 0, 0));
  const ids = rows.map((r) => r.i.id);
  const lines = ids.length ? await db.select().from(inquiryLines).where(inArray(inquiryLines.inquiryId, ids)) : [];
  const active = ids.length ? await db.select().from(inquirySales).where(and(inArray(inquirySales.inquiryId, ids), eq(inquirySales.active, true))) : [];
  return {
    total: n,
    rows: rows.map(({ i, accountName, accountEmail }) => {
      const ls = lines.filter((l) => l.inquiryId === i.id);
      return {
        id: i.id, createdAt: i.createdAt, source: i.source, crmStatus: i.crmStatus as CrmStatus, contactConfirmedAt: i.contactConfirmedAt,
        name: i.contactName ?? accountName ?? null, accountEmail: accountEmail ?? null, phone: i.contactPhone,
        units: ls.reduce((s, l) => s + l.quantity, 0), lineCount: ls.length, encargoLines: ls.filter((l) => l.fulfillment === "encargo").length,
        subtotalMinor: i.subtotalMinor, discountMinor: i.discountMinor, saleId: active.find((a) => a.inquiryId === i.id)?.saleId ?? null,
      };
    }),
  };
}

export type InquiryDetail = NonNullable<Awaited<ReturnType<typeof getInquiryDetail>>>;
export async function getInquiryDetail(db: Db, id: string) {
  const [row] = await db.select({ i: inquiries, accountName: user.name, accountEmail: user.email }).from(inquiries).leftJoin(user, eq(user.id, inquiries.userId)).where(eq(inquiries.id, id));
  if (!row) return null;
  const [lines, events, links] = await Promise.all([
    db.select().from(inquiryLines).where(eq(inquiryLines.inquiryId, id)).orderBy(inquiryLines.id),
    db.select().from(inquiryEvents).where(eq(inquiryEvents.inquiryId, id)).orderBy(desc(inquiryEvents.createdAt), desc(inquiryEvents.id)),
    db.select({ link: inquirySales, sale: sales }).from(inquirySales).innerJoin(sales, eq(sales.id, inquirySales.saleId)).where(eq(inquirySales.inquiryId, id)).orderBy(desc(inquirySales.createdAt), desc(inquirySales.id)),
  ]);
  const sold = links.map((l) => ({ ...l.sale, linkKind: l.link.kind, linkActive: l.link.active }));
  return { inquiry: row.i, accountName: row.accountName, accountEmail: row.accountEmail, lines, events, sales: sold, activeSale: sold.find((s) => s.linkActive) ?? null };
}

/** Ventas vigentes que todavía no están vinculadas a ninguna consulta (candidatas a «Vincular una venta ya registrada»). */
export async function listLinkableSales(db: Db, limit = 100) {
  return db.select().from(sales).where(and(eq(sales.status, "registrada"), sql`not exists (select 1 from "inquiry_sales" where "inquiry_sales"."sale_id" = "sales"."id")`)).orderBy(desc(sales.createdAt)).limit(limit);
}

const NoteSchema = z.string().trim().min(1, "Escribí la nota.").max(1000, "La nota es demasiado larga (máximo 1000).");
export const InquiryActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm_contact") }),
  z.object({ action: z.literal("unconfirm_contact") }),
  z.object({ action: z.literal("set_status"), status: z.enum(["pendiente", "en_seguimiento", "no_concretada"], { error: "Estado no válido." }), reason: z.string().trim().max(300, "El motivo es demasiado largo (máximo 300).").nullish() }),
  z.object({ action: z.literal("note"), text: NoteSchema }),
]);
export type InquiryAction = z.infer<typeof InquiryActionSchema>;

/** Cambios de gestión sobre una consulta, bajo el mismo candado que las conversiones y con una fila de historial por cambio. Repetir el mismo cambio no hace nada. */
export async function applyInquiryAction(db: Db, id: string, input: unknown, actor: Actor, now = Date.now()): Promise<{ changed: boolean }> {
  const parsed = InquiryActionSchema.safeParse(input);
  if (!parsed.success) throw new SaleError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Revisá los datos.");
  const a = parsed.data;
  return db.transaction(async (tx) => {
    await lockKey(tx, `inquiry:${id}`);
    const [cur] = await tx.select().from(inquiries).where(eq(inquiries.id, id));
    if (!cur) throw new SaleError(404, "not_found", "La consulta no existe.");
    const ev = (kind: string, detail: string) => tx.insert(inquiryEvents).values({ inquiryId: id, kind, detail, actorEmail: actor.email, createdAt: now });
    if (a.action === "note") {
      await ev("note", a.text);
      return { changed: true };
    }
    if (a.action === "confirm_contact") {
      if (cur.contactConfirmedAt) return { changed: false };
      await tx.update(inquiries).set({ contactConfirmedAt: now }).where(eq(inquiries.id, id));
      await ev("contact_confirmed", "Contacto confirmado a mano.");
      return { changed: true };
    }
    if (a.action === "unconfirm_contact") {
      if (!cur.contactConfirmedAt) return { changed: false };
      if (cur.crmStatus === "convertida") throw new SaleError(409, "converted", "La consulta tiene una venta: el contacto no se puede desmarcar.");
      await tx.update(inquiries).set({ contactConfirmedAt: null }).where(eq(inquiries.id, id));
      await ev("contact_unconfirmed", "Se desmarcó el contacto confirmado.");
      return { changed: true };
    }
    if (cur.crmStatus === "convertida") throw new SaleError(409, "converted", "La consulta tiene una venta vigente. Anulá primero la venta y la consulta volverá a «En seguimiento».");
    const reason = a.status === "no_concretada" ? (a.reason?.trim() || null) : null;
    if (cur.crmStatus === a.status && (cur.lostReason ?? null) === reason) return { changed: false };
    await tx.update(inquiries).set({ crmStatus: a.status, lostReason: reason }).where(eq(inquiries.id, id));
    await ev("status", `${crmLabel[cur.crmStatus as CrmStatus]} → ${crmLabel[a.status]}${reason ? ` · Motivo: ${reason}` : ""}`);
    return { changed: true };
  });
}

const paymentIds = paymentMethods.map((p) => p.id) as [string, ...string[]];
export const ManualInquirySchema = z.object({
  idempotencyKey: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
  customerName: z.string({ error: "Escribí el nombre y apellido." }).transform(normalizeName).refine(isFullName, "Escribí el nombre y apellido de la persona (solo letras)."),
  customerPhone: z.string().trim().max(20, "El teléfono es demasiado largo.").nullish().transform((v) => (v ? v : null))
    .refine((v) => v === null || (/^[0-9+()\-\s]+$/.test(v) && v.replace(/\D/g, "").length >= 6), "Teléfono: usá solo números, espacios, + y guiones (mínimo 6 dígitos)."),
  channel: z.enum(Object.keys(CHANNELS) as [keyof typeof CHANNELS, ...Array<keyof typeof CHANNELS>], { error: "Elegí por qué medio llegó." }),
  /** Fecha en que llegó la consulta (ms). Si falta, rige el momento de la carga. */
  receivedAt: z.number().int().positive().nullish().transform((v) => v ?? null),
  paymentMethod: z.enum(paymentIds, { error: "Elegí un método de pago." }).default("efectivo"),
  deliveryLabel: z.string().trim().max(200).default(""),
  note: z.string().trim().max(1000, "La nota es demasiado larga (máximo 1000).").nullish().transform((v) => (v ? v : null)),
  lines: z.array(z.object({
    productId: z.string().min(1).max(80),
    quantity: z.number({ error: "La cantidad debe ser un número." }).int("La cantidad debe ser un número entero.").min(1, "La cantidad mínima es 1.").max(999, "La cantidad es demasiado alta."),
    fulfillment: z.enum(["stock", "encargo"]),
    unitPriceMinor: z.number({ error: "El precio debe ser un número." }).int().min(0, "El precio no puede ser negativo.").max(1_000_000_000_00),
  })).min(1, "Agregá al menos un producto.").max(30),
});
export type ManualInquiryInput = z.input<typeof ManualInquirySchema>;

/**
 * Carga una consulta que llegó por otro medio (WhatsApp directo, redes, en persona…). Nace con el contacto ya confirmado (la persona ya habló con el dueño)
 * y nadie más puede verla: no pertenece a ninguna sesión ni cuenta. Idempotente por clave (doble clic). No reserva ni descuenta stock.
 */
export async function createManualInquiry(db: Db, input: unknown, actor: Actor, now = Date.now()): Promise<{ id: string; replayed: boolean }> {
  const parsed = ManualInquirySchema.safeParse(input);
  if (!parsed.success) throw new SaleError(400, "invalid_input", parsed.error.issues[0]?.message ?? "Revisá los datos.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const v = parsed.data;
  const at = v.receivedAt ?? now;
  if (at > now + 24 * 3600 * 1000) throw new SaleError(400, "invalid_input", "La fecha no puede ser futura.");
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const keys = v.lines.map((l) => `${l.productId}|${l.fulfillment}`);
  if (new Set(keys).size !== keys.length) throw new SaleError(400, "invalid_input", "Hay un producto repetido. Sumá las cantidades en una sola línea.");
  if (v.lines.some((l) => !byId.has(l.productId))) throw new SaleError(400, "invalid_input", "Hay productos que no existen en el catálogo.");
  const key = `manual-${v.idempotencyKey}`;
  const subtotal = v.lines.reduce((n, l) => (l.fulfillment === "encargo" ? n : n + l.quantity * l.unitPriceMinor), 0);
  const hash = createHash("sha256").update(JSON.stringify([v.customerName, v.customerPhone, v.channel, v.lines])).digest("hex");
  const message = [
    `Consulta cargada a mano por el dueño (medio: ${CHANNELS[v.channel]}).`,
    `Persona: ${v.customerName}${v.customerPhone ? ` · ${v.customerPhone}` : ""}`,
    ...v.lines.map((l) => `${l.quantity} × ${byId.get(l.productId)!.title} (${l.fulfillment === "encargo" ? "por encargo" : "del stock"})`),
    ...(v.note ? [`Nota: ${v.note}`] : []),
  ].join("\n");
  const exists = async () => (await db.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.idempotencyKey, key)))[0];
  const dup = await exists();
  if (dup) return { id: dup.id, replayed: true };
  const id = newReference();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(inquiries).values({
        id, idempotencyKey: key, contentHash: hash, sessionTokenHash: createHash("sha256").update(randomBytes(24)).digest("hex"), userId: null,
        status: "consulta_manual", currency: "ARS", subtotalMinor: subtotal, discountMinor: 0,
        deliveryMethod: "manual", deliveryJson: JSON.stringify({ method: "manual", label: v.deliveryLabel }), paymentPreference: v.paymentMethod,
        contactName: v.customerName, contactPhone: v.customerPhone, message, createdAt: at, source: "manual", crmStatus: "pendiente", contactConfirmedAt: at,
      });
      await tx.insert(inquiryLines).values(v.lines.map((l) => {
        const p = byId.get(l.productId)!;
        return { inquiryId: id, productId: p.id, sku: p.sku, title: p.title, language: p.language, quantity: l.quantity, fulfillment: l.fulfillment, unitPriceUsdMinor: null, unitPriceMinor: l.fulfillment === "encargo" ? 0 : l.unitPriceMinor, lineSubtotalMinor: l.fulfillment === "encargo" ? 0 : l.quantity * l.unitPriceMinor };
      }));
      await tx.insert(inquiryEvents).values({ inquiryId: id, kind: "created", detail: `Consulta cargada a mano · medio: ${CHANNELS[v.channel]}${v.note ? ` · ${v.note}` : ""}`, actorEmail: actor.email, createdAt: now });
    });
  } catch (e) {
    const raced = await exists();
    if (raced) return { id: raced.id, replayed: true };
    throw e;
  }
  return { id, replayed: false };
}

export type Metrics = {
  generated: number; web: number; manual: number; contactConfirmed: number;
  pendiente: number; enSeguimiento: number; noConcretada: number; convertida: number;
  /** convertidas ÷ generadas (null si no hay consultas). */
  conversionGenerated: number | null;
  /** convertidas ÷ con contacto confirmado (null si ninguna). */
  conversionConfirmed: number | null;
  /** Ventas vigentes del período según la FECHA DE LA VENTA (no la de la consulta) y su ingreso en centavos. */
  salesCount: number; revenueMinor: number; voidedCount: number; salesWithoutInquiry: number;
};

/**
 * Métricas del período. Las de consultas (generadas, contactos, estados, conversión) son de las consultas CREADAS en el período, aunque se hayan
 * convertido después. Las de ventas e ingresos van aparte y se cuentan por fecha de venta. Una venta anulada no cuenta como conversión ni como ingreso.
 */
export async function inquiryMetrics(db: Db, f: Pick<InquiryFilters, "from" | "to"> = {}): Promise<Metrics> {
  const { from, to } = periodWhere(f);
  const iw = and(from !== undefined ? gte(inquiries.createdAt, from) : undefined, to !== undefined ? lt(inquiries.createdAt, to) : undefined);
  const sw = and(from !== undefined ? gte(sales.createdAt, from) : undefined, to !== undefined ? lt(sales.createdAt, to) : undefined);
  const [i] = await db.select({
    generated: sql<number>`count(*)::int`,
    web: sql<number>`(count(*) filter (where ${inquiries.source} = 'web'))::int`,
    manual: sql<number>`(count(*) filter (where ${inquiries.source} = 'manual'))::int`,
    contactConfirmed: sql<number>`(count(*) filter (where ${inquiries.contactConfirmedAt} is not null))::int`,
    pendiente: sql<number>`(count(*) filter (where ${inquiries.crmStatus} = 'pendiente'))::int`,
    enSeguimiento: sql<number>`(count(*) filter (where ${inquiries.crmStatus} = 'en_seguimiento'))::int`,
    noConcretada: sql<number>`(count(*) filter (where ${inquiries.crmStatus} = 'no_concretada'))::int`,
    convertida: sql<number>`(count(*) filter (where ${inquiries.crmStatus} = 'convertida'))::int`,
  }).from(inquiries).where(iw);
  const [s] = await db.select({
    salesCount: sql<number>`(count(*) filter (where ${sales.status} = 'registrada'))::int`,
    revenueMinor: sql<number>`coalesce(sum(${sales.totalMinor}) filter (where ${sales.status} = 'registrada'), 0)::bigint`,
    voidedCount: sql<number>`(count(*) filter (where ${sales.status} = 'anulada'))::int`,
    salesWithoutInquiry: sql<number>`(count(*) filter (where ${sales.status} = 'registrada' and not exists (select 1 from "inquiry_sales" where "inquiry_sales"."sale_id" = "sales"."id")))::int`,
  }).from(sales).where(sw);
  return {
    ...i,
    conversionGenerated: i.generated ? i.convertida / i.generated : null,
    conversionConfirmed: i.contactConfirmed ? i.convertida / i.contactConfirmed : null,
    ...s, revenueMinor: Number(s.revenueMinor),
  };
}
