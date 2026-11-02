import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { paymentReceipts } from "@/db/schema";
import { receiptFile } from "@/features/pedidos/pagos";
import { errorJson } from "@/server/http";
import { orderIfAllowed, viewerForRequest } from "@/server/pedido-access";
import { getReceiptStore } from "@/server/receipt-store";
import { StorageError } from "@/server/storage";

export const runtime = "nodejs";

/**
 * Descarga PRIVADA de un comprobante: solo quien puede ver ese pedido (su cuenta, su sesión de invitado o su enlace privado) o el administrador.
 * Para cualquier otra persona responde 404 igual que si no existiera. Nunca se cachea ni se interpreta como página.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const [r] = await db.select({ inquiryId: paymentReceipts.inquiryId }).from(paymentReceipts).where(eq(paymentReceipts.id, id));
  const who = await viewerForRequest(req, new URL(req.url).searchParams.get("k"));
  if (!r || !(await orderIfAllowed(db, r.inquiryId, who))) return errorJson(404, "not_found", "No encontramos ese comprobante.");
  try {
    const f = await receiptFile(db, getReceiptStore(), id);
    if (!f) return errorJson(404, "not_found", "No encontramos ese comprobante.");
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.contentType,
        "Content-Disposition": `inline; filename="${f.name}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    if (e instanceof StorageError) return errorJson(e.status, e.code, "No pudimos abrir el comprobante por ahora.");
    throw e;
  }
}
