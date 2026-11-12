import { getDb } from "@/db/client";
import { flushQuietly } from "@/features/avisos/outbox";
import { applyLineCost } from "@/features/costos/service";
import { confirmPayment, markRefunded, openIncident, registerRefund, rejectReceipt, resolveIncident, voidPayment } from "@/features/pedidos/pagos";
import { recordDelivery } from "@/features/pedidos/envios";
import { addWholesaleCost, setWholesaleGuide, voidWholesaleCost } from "@/features/pedidos/mayorista-admin";
import { updateWholesaleContact } from "@/features/pedidos/mayorista-manual";
import { addNote, cancelOrder, issueAccessLink, openTracking, setAgreedAmount, setStage } from "@/features/pedidos/service";
import { SaleError } from "@/features/sales/errors";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/**
 * Operaciones del dueño sobre un pedido (etapas, importe acordado, pagos, comprobantes, incidentes, reintegros, entregas, enlace privado y costos).
 * Una sola entrada con `action`: todas validan administrador y origen en el servidor, son idempotentes por clave y, si cambian algo que se avisa por correo, intentan el
 * envío DESPUÉS de guardar (si falla, el cambio queda y el aviso figura pendiente o fallido).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return adminAction(req, "pedidos", async ({ user, body }) => {
    const b = (body ?? {}) as Record<string, unknown>;
    const db = getDb();
    const actor = { id: user.id, email: user.email };
    const out = await (async (): Promise<unknown> => {
      switch (b.action) {
        case "open": return (await openTracking(db, id)).track;
        case "stage": return setStage(db, id, b, actor);
        case "agreed": return setAgreedAmount(db, id, b, actor);
        case "note": return addNote(db, id, b, actor);
        case "cancel": return cancelOrder(db, id, b, actor);
        case "payment": return confirmPayment(db, id, b, actor);
        case "void_payment": return voidPayment(db, String(b.paymentId ?? ""), b, actor);
        case "reject_receipt": return rejectReceipt(db, String(b.receiptId ?? ""), b, actor);
        case "incident": return openIncident(db, id, b, actor);
        case "resolve_incident": return resolveIncident(db, String(b.incidentId ?? ""), b, actor);
        case "refund": return registerRefund(db, id, b, actor);
        case "mark_refunded": return markRefunded(db, String(b.refundId ?? ""), b, actor);
        case "delivery": return recordDelivery(db, id, { ...b, lines: b.lines ?? [{ lineId: Number(b.lineId), quantity: b.quantity }] }, actor);
        case "access_link": return issueAccessLink(db, id);
        case "wholesale_cost": return addWholesaleCost(db, id, b, actor);
        case "wholesale_void_cost": return voidWholesaleCost(db, id, b, actor);
        case "wholesale_guide": return setWholesaleGuide(db, id, b);
        case "wholesale_contact": return updateWholesaleContact(db, id, b, actor);
        case "apply_cost": return applyLineCost(db, { refKind: "order_line", refId: b.lineId, unitCostMinor: b.unitCostMinor ?? undefined }, actor);
        default: throw new SaleError(400, "invalid_input", "Acción desconocida.");
      }
    })();
    await flushQuietly(db);
    return out;
  });
}
