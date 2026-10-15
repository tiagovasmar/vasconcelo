import { getDb } from "@/db/client";
import { registerSale } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Confirma la venta: la registra y descuenta el stock en una sola transacción (idempotente por clave). */
export function POST(req: Request) {
  return adminAction(req, "ventas-registrar", async ({ user, body }) => {
    const r = await registerSale(getDb(), body, user);
    return { ok: true, replayed: r.replayed, sale: r.sale };
  }, { limit: 30 });
}
