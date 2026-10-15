import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { mayorista } from "@/content/politicas";
import type { Db } from "@/db/client";
import { user, wholesaleRequests } from "@/db/schema";
import { provinces } from "@/features/inquiries/schemas";
import type { WholesaleStatus } from "@/features/politicas/mayorista";

/**
 * Solicitudes de cuenta mayorista. Guardar una solicitud NO activa ningún beneficio: queda «pendiente» y ningún usuario tiene precio
 * mayorista mientras `mayorista.activationEnabled` sea false (el dueño todavía define compra mínima, acumulación con otros descuentos
 * y si la aprobación es manual o automática). Todo lo decide el servidor: el navegador no manda ni el estado ni el porcentaje.
 */
export const wholesaleStatuses = ["pendiente", "aprobada", "rechazada"] as const;

const text = (label: string, min: number, max: number) =>
  z.string({ error: `${label}: obligatorio` }).trim().min(min, `${label}: obligatorio`).max(max, `${label}: demasiado largo`);

export const WholesaleRequestSchema = z.object({
  businessName: text("Nombre comercial o actividad", 2, 80),
  locality: text("Localidad", 2, 80),
  province: z.enum(provinces, { error: "Provincia: elegí una opción" }),
  note: z.string().trim().max(500, "La nota admite hasta 500 caracteres").optional().transform((v) => (v ? v : undefined)),
});
export type WholesaleRequestInput = z.infer<typeof WholesaleRequestSchema>;

export type WholesaleRequestView = {
  reference: string;
  status: WholesaleStatus;
  businessName: string;
  locality: string;
  province: string;
  note?: string;
  createdAt: number;
  reviewedAt?: number;
};
export type AdminWholesaleView = WholesaleRequestView & { userId: string; name: string; email: string; reviewedByEmail?: string };

export type WholesaleErrorInfo = { status: number; code: "invalid_input" | "not_found" | "policy_pending" | "persistence_error"; message: string; details?: unknown };
export class WholesaleError extends Error {
  constructor(public readonly info: WholesaleErrorInfo) {
    super(info.message);
  }
}

/** Referencia pública no secuencial (p. ej. MY-7K3M9QX2). */
function newReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "MY-" + Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

const toView = (r: typeof wholesaleRequests.$inferSelect): WholesaleRequestView => ({
  reference: r.id,
  status: (wholesaleStatuses as readonly string[]).includes(r.status) ? (r.status as WholesaleStatus) : "pendiente",
  businessName: r.businessName,
  locality: r.locality,
  province: r.province,
  ...(r.note ? { note: r.note } : {}),
  createdAt: r.createdAt,
  ...(r.reviewedAt ? { reviewedAt: r.reviewedAt } : {}),
});

export async function getWholesaleRequest(db: Db, userId: string): Promise<WholesaleRequestView | null> {
  const [row] = await db.select().from(wholesaleRequests).where(eq(wholesaleRequests.userId, userId));
  return row ? toView(row) : null;
}

/** Estado de la solicitud de un usuario (null = nunca solicitó). Es lo único que deben leer los cálculos de precio mayorista. */
export const wholesaleStatusFor = async (db: Db, userId: string): Promise<WholesaleStatus | null> => (await getWholesaleRequest(db, userId))?.status ?? null;

/**
 * Crea la solicitud del usuario autenticado (el `userId` sale SIEMPRE de la sesión, nunca del cuerpo). Una por usuario: repetir la
 * petición no crea otra ni pisa la anterior, devuelve la existente con `replayed: true`.
 */
export async function createWholesaleRequest(db: Db, userId: string, body: unknown, now = Date.now()): Promise<{ request: WholesaleRequestView; replayed: boolean }> {
  const parsed = WholesaleRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new WholesaleError({ status: 400, code: "invalid_input", message: "Revisá los datos de la solicitud.", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const existing = await getWholesaleRequest(db, userId);
  if (existing) return { request: existing, replayed: true };
  const d = parsed.data;
  try {
    await db.insert(wholesaleRequests).values({ id: newReference(), userId, businessName: d.businessName, locality: d.locality, province: d.province, note: d.note ?? null, status: "pendiente", createdAt: now });
  } catch (e) {
    // Carrera de doble clic: otra petición del mismo usuario ganó (clave única por usuario).
    const raced = await getWholesaleRequest(db, userId);
    if (raced) return { request: raced, replayed: true };
    throw new WholesaleError({ status: 500, code: "persistence_error", message: "No pudimos guardar tu solicitud. Intentá de nuevo.", details: e instanceof Error ? e.message : undefined });
  }
  return { request: (await getWholesaleRequest(db, userId))!, replayed: false };
}

/** Listado para el panel del dueño (solo lectura). Más recientes primero. */
export async function listWholesaleRequests(db: Db): Promise<AdminWholesaleView[]> {
  const rows = await db
    .select({ r: wholesaleRequests, name: user.name, email: user.email })
    .from(wholesaleRequests)
    .innerJoin(user, eq(user.id, wholesaleRequests.userId))
    .orderBy(desc(wholesaleRequests.createdAt));
  return rows
    .map(({ r, name, email }) => ({ ...toView(r), userId: r.userId, name, email, ...(r.reviewedByEmail ? { reviewedByEmail: r.reviewedByEmail } : {}) }));
}

/**
 * Mecanismo de revisión (aprobar / rechazar), listo pero APAGADO: mientras `mayorista.activationEnabled` sea false responde 409
 * `policy_pending` y no cambia nada. Quien lo llame debe haber verificado antes que es el administrador (`adminFromRequest`).
 */
export async function reviewWholesaleRequest(
  db: Db,
  reference: string,
  status: Exclude<WholesaleStatus, "pendiente">,
  reviewerEmail: string,
  opts: { activationEnabled?: boolean; now?: number } = {},
): Promise<WholesaleRequestView> {
  if (!(opts.activationEnabled ?? mayorista.activationEnabled)) {
    throw new WholesaleError({ status: 409, code: "policy_pending", message: "La revisión de cuentas mayoristas todavía no está habilitada: faltan definir la compra mínima, la acumulación con otros descuentos y el tipo de aprobación." });
  }
  const [row] = await db.select().from(wholesaleRequests).where(eq(wholesaleRequests.id, reference));
  if (!row) throw new WholesaleError({ status: 404, code: "not_found", message: "No existe esa solicitud." });
  await db.update(wholesaleRequests).set({ status, reviewedAt: opts.now ?? Date.now(), reviewedByEmail: reviewerEmail }).where(eq(wholesaleRequests.id, reference));
  const [updated] = await db.select().from(wholesaleRequests).where(eq(wholesaleRequests.id, reference));
  return toView(updated);
}
