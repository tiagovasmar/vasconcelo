import { getDb } from "@/db/client";
import { deleteTier, publishTiers, saveRules, saveTier, unpublishTiers } from "@/features/mayorista/precios";
import { SaleError } from "@/features/sales/errors";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Catálogo mayorista (solo el dueño): condiciones comerciales y tramos de precio por cantidad, en borrador hasta publicarlos. */
export async function POST(req: Request) {
  return adminAction(req, "mayorista", async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const actor = { id: user.id, email: user.email };
    switch (b.action) {
      case "rules": return saveRules(db, b.rules ?? b, actor);
      case "tier": return saveTier(db, b, actor);
      case "delete_tier": return deleteTier(db, String(b.productId ?? ""), Number(b.minQty));
      case "publish": return publishTiers(db, String(b.productId ?? ""), actor);
      case "unpublish": return { unpublished: await unpublishTiers(db, String(b.productId ?? ""), actor) };
      default: throw new SaleError(400, "invalid_input", "Acción desconocida.");
    }
  }, { limit: 120 });
}
