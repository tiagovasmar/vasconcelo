import { releaseReservation } from "@/features/importaciones/preorders";
import { getDb } from "@/db/client";
import { flushQuietly } from "@/features/avisos/outbox";
import { confirmPurchase, createPurchase } from "@/features/costos/service";
import { markOrdered, payPurchase, receiveParcel, removeDestination, saveDestination, setParcel, setPublication } from "@/features/importaciones/service";
import { SaleError } from "@/features/sales/errors";
import { adminAction } from "@/server/admin-api";

export async function POST(req: Request) {
  return adminAction(req, "compras", async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const db = getDb();
    switch (b.action) {
      case "create": return createPurchase(db, b, user, Date.now(), { managedImport: true });
      case "edit": return createPurchase(db, b, user, Date.now(), { editId: String(b.purchaseId ?? ""), managedImport: true });
      case "close": return confirmPurchase(db, String(b.purchaseId ?? ""), user);
      case "destination": return saveDestination(db, b);
      case "remove_destination": return removeDestination(db, b);
      case "publication": return setPublication(db, b);
      case "ordered": return markOrdered(db, b);
      case "parcel": return setParcel(db, b);
      case "pay": return payPurchase(db, b, user);
      case "release": return releaseReservation(db, String(b.inquiryId ?? ""));
      case "receive": {
        const result = await receiveParcel(db, b, user);
        await flushQuietly(db);
        return result;
      }
      default: throw new SaleError(400, "invalid_input", "Acción desconocida.");
    }
  }, { limit: 120, bodyLimit: 128_000 });
}
