import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { adminSettings, productAudit } from "@/db/schema";
import { catalog } from "@/content/catalog";
import { COMBO_OFF, type ComboConfig } from "./combo";

/**
 * Configuración de la promoción caja + sobres: activada o no y qué cajas y qué sobres participan. La elige el dueño en /admin/promociones; vive en
 * `admin_settings` (clave `promo_combo`, JSON) y cada cambio queda en el historial de cambios con quién, cuándo y los valores anterior y nuevo.
 * Mientras no la configure está APAGADA y sin productos: el código no trae ninguna selección definitiva. No modifica los precios de ningún producto.
 */
export const COMBO_KEY = "promo_combo";
export const COMBO_AUDIT_ID = "promo-combo";
export const MAX_PARTICIPANTS = 200;

export type ComboSetting = { config: ComboConfig; custom: boolean; updatedAt: number | null; updatedByEmail: string | null };

function parse(raw: string): ComboConfig | null {
  try {
    const v = JSON.parse(raw) as Partial<ComboConfig>;
    if (typeof v.enabled !== "boolean" || !Array.isArray(v.boxIds) || !Array.isArray(v.boosterIds)) return null;
    const ids = (a: unknown[]) => [...new Set(a.filter((x): x is string => typeof x === "string"))].sort();
    return { enabled: v.enabled, boxIds: ids(v.boxIds), boosterIds: ids(v.boosterIds) };
  } catch {
    return null;
  }
}

export async function getComboConfig(db: Db): Promise<ComboSetting> {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, COMBO_KEY));
  const config = row ? parse(row.value) : null;
  if (!row || !config) return { config: COMBO_OFF, custom: false, updatedAt: null, updatedByEmail: null };
  return { config, custom: true, updatedAt: row.updatedAt, updatedByEmail: row.updatedByEmail };
}

export class PromoError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const ComboInputSchema = z.object({
  enabled: z.boolean({ error: "Indicá si la promoción está activada." }),
  boxIds: z.array(z.string().min(1).max(80)).max(MAX_PARTICIPANTS, "Demasiadas cajas."),
  boosterIds: z.array(z.string().min(1).max(80)).max(MAX_PARTICIPANTS, "Demasiados sobres."),
  /** Versión que el panel tenía cargada (0 = nunca se guardó): detecta ediciones simultáneas. */
  expectedVersion: z.number().int().min(0),
});

/** Guarda la configuración de forma atómica, validando contra el catálogo; si no cambió nada, no escribe. */
export async function saveComboConfig(db: Db, input: unknown, actor: { id: string; email: string }, now = Date.now()): Promise<ComboSetting> {
  const r = ComboInputSchema.safeParse(input);
  if (!r.success) throw new PromoError(400, "invalid_input", r.error.issues[0]?.message ?? "Revisá los datos.");
  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const clean = (ids: string[], kind: "box" | "booster", label: string) => {
    const unique = [...new Set(ids)].sort();
    for (const id of unique) {
      const p = byId.get(id);
      if (!p) throw new PromoError(400, "invalid_input", `«${id}» no existe en el catálogo.`);
      if (p.kind !== kind) throw new PromoError(400, "invalid_input", `«${p.title}» no es ${label}: solo ${kind === "box" ? "las cajas" : "los sobres individuales"} pueden participar acá.`);
      if (p.retired) throw new PromoError(400, "invalid_input", `«${p.title}» está retirado de la oferta.`);
    }
    return unique;
  };
  const next: ComboConfig = { enabled: r.data.enabled, boxIds: clean(r.data.boxIds, "box", "una caja"), boosterIds: clean(r.data.boosterIds, "booster", "un sobre") };
  if (next.enabled && (next.boxIds.length === 0 || next.boosterIds.length === 0)) throw new PromoError(400, "invalid_input", "Para activar la promoción elegí al menos una caja y un sobre participantes.");

  return db.transaction(async (tx) => {
    await lockKey(tx, `setting:${COMBO_KEY}`);
    const [row] = await tx.select().from(adminSettings).where(eq(adminSettings.key, COMBO_KEY));
    const version = row?.updatedAt ?? 0;
    if (r.data.expectedVersion !== version) throw new PromoError(409, "stale", "La configuración se modificó mientras la editabas. Recargá la página y volvé a intentarlo.");
    const before = (row ? parse(row.value) : null) ?? COMBO_OFF;
    if (JSON.stringify(before) === JSON.stringify(next)) return { config: before, custom: Boolean(row), updatedAt: row?.updatedAt ?? null, updatedByEmail: row?.updatedByEmail ?? null };
    const stamp = Math.max(now, version + 1);
    const values = { value: JSON.stringify(next), updatedAt: stamp, updatedByEmail: actor.email };
    await tx.insert(adminSettings).values({ key: COMBO_KEY, ...values }).onConflictDoUpdate({ target: adminSettings.key, set: values });
    await tx.insert(productAudit).values({ productId: COMBO_AUDIT_ID, sku: "PROMO-COMBO", field: "promo_combo", oldValue: JSON.stringify(before), newValue: JSON.stringify(next), userId: actor.id, userEmail: actor.email, createdAt: stamp });
    return { config: next, custom: true, updatedAt: stamp, updatedByEmail: actor.email };
  });
}
