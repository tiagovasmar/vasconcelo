import { getDb } from "@/db/client";
import { addCommission, applyLineCost, confirmPurchase, createPurchase } from "@/features/costos/service";
import { SaleError } from "@/features/sales/errors";
import { adminAction } from "@/server/admin-api";
import { saveProductCost } from "@/features/costos/product-costs";

export const runtime = "nodejs";

/** Costos privados (solo el dueño): compras, confirmación, costo de una línea y comisiones. Nada de esto se expone fuera del panel. */
export async function POST(req: Request) {
  return adminAction(req, "costos", async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const actor = { id: user.id, email: user.email };
    switch (b.action) {
      case "create_purchase": return createPurchase(db, b, actor);
      case "confirm_purchase": return confirmPurchase(db, String(b.purchaseId ?? ""), actor);
      case "apply_cost": return applyLineCost(db, b, actor);
      case "product_cost": return saveProductCost(db, b, user.email);
      case "commission": return addCommission(db, b, actor);
      default: throw new SaleError(400, "invalid_input", "Acción desconocida.");
    }
  }, { limit: 120 });
}
