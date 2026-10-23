import { getDb } from "@/db/client";
import { SaleError } from "@/features/sales/errors";
import { PromoError, saveComboConfig } from "@/features/promos/settings";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/**
 * Guarda la configuración de la promoción caja + sobres (activada o no, y qué cajas y sobres participan). Solo el administrador configurado; mismo origen;
 * validada contra el catálogo; con control de versión (una edición simultánea se rechaza) y registro en el historial de cambios. No toca ningún precio.
 */
export function PATCH(req: Request) {
  return adminAction(req, "promo-combo", async ({ user, body }) => {
    try {
      const s = await saveComboConfig(getDb(), body, user);
      return { ok: true, config: s.config, version: s.updatedAt ?? 0 };
    } catch (e) {
      if (e instanceof PromoError) throw new SaleError(e.status, e.code === "stale" ? "stale" : "invalid_input", e.message);
      throw e;
    }
  }, { limit: 30 });
}
