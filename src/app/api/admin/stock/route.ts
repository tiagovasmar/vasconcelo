import { getDb } from "@/db/client";
import { moveStock } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Entrada de mercadería o ajuste de stock (con motivo). Queda en el historial de movimientos. */
export function POST(req: Request) {
  return adminAction(req, "stock-mover", async ({ user, body }) => ({ ok: true, ...(await moveStock(getDb(), body, user)) }), { limit: 60 });
}
