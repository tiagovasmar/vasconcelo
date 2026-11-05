import { getDb } from "@/db/client";
import { flushQuietly } from "@/features/avisos/outbox";
import { createShipment, removeShipmentItem, setShipmentItem, updateShipmentMetadata, updateShipmentStatus } from "@/features/pedidos/envios";
import { SaleError } from "@/features/sales/errors";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Envíos internacionales agrupados: crear, sumar o quitar artículos de varios pedidos y avanzar el estado con la fecha real. */
export async function POST(req: Request) {
  return adminAction(req, "envios", async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const actor = { id: user.id, email: user.email };
    const out = await (async (): Promise<unknown> => {
      switch (b.action) {
        case "create": return createShipment(db, b, actor);
        case "item": return setShipmentItem(db, String(b.shipmentId ?? ""), { lineId: Number(b.lineId), quantity: b.quantity });
        case "remove_item": return removeShipmentItem(db, String(b.shipmentId ?? ""), Number(b.lineId));
        case "metadata": return updateShipmentMetadata(db, String(b.shipmentId ?? ""), b);
        case "status": return updateShipmentStatus(db, String(b.shipmentId ?? ""), b, actor);
        default: throw new SaleError(400, "invalid_input", "Acción desconocida.");
      }
    })();
    await flushQuietly(db);
    return out;
  });
}
