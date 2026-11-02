import { getDb } from "@/db/client";
import { MAX_RECEIPT_BYTES, uploadReceipt } from "@/features/pedidos/pagos";
import { SaleError } from "@/features/sales/errors";
import { parseMoney } from "@/lib/money-input";
import { errorJson, json, rateLimited, sameOrigin } from "@/server/http";
import { orderIfAllowed, viewerForRequest } from "@/server/pedido-access";
import { getReceiptStore } from "@/server/receipt-store";
import { StorageError } from "@/server/storage";

export const runtime = "nodejs";

/**
 * Adjuntar el comprobante de una transferencia a un pedido propio. Subirlo NO confirma el pago: queda pendiente de revisión hasta que el dueño confirme el ingreso.
 * Controles en el servidor: mismo origen, límite de uso, que el pedido sea de quien sube (cuenta, cookie de invitado o enlace privado), tipo REAL del archivo y tamaño.
 * El archivo va a un almacén PRIVADO, nunca al bucket público de fotos de productos.
 */
export async function POST(req: Request, ctx: { params: Promise<{ ref: string }> }) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "comprobantes", 12, 3600)) return errorJson(429, "rate_limited", "Subiste varios comprobantes seguidos. Esperá un rato.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_RECEIPT_BYTES + 64 * 1024) return errorJson(413, "too_large", `El archivo supera los ${MAX_RECEIPT_BYTES / 1024 / 1024} MB permitidos.`);
  const { ref } = await ctx.params;
  const link = new URL(req.url).searchParams.get("k");
  const who = await viewerForRequest(req, link);
  const db = getDb();
  const found = await orderIfAllowed(db, ref, who);
  if (!found) return errorJson(404, "not_found", "No encontramos ese pedido.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson(400, "invalid_input", "No pudimos leer el archivo. Intentá de nuevo.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return errorJson(400, "invalid_input", "Elegí el archivo del comprobante.");
  const amountText = String(form.get("declaredAmount") ?? "").trim();
  const declaredAmountMinor = amountText ? parseMoney(amountText) : null;
  if (amountText && declaredAmountMinor === null) return errorJson(400, "invalid_input", "El importe indicado no es válido.");
  try {
    const r = await uploadReceipt(db, getReceiptStore(), {
      inquiryId: ref,
      viewer: { kind: who.user && found.inquiry.userId === who.user.id ? "cuenta" : link ? "enlace" : "invitado", userId: who.user?.id ?? null },
      file: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      declaredAmountMinor,
      note: String(form.get("note") ?? ""),
    });
    return json(r, r.duplicate ? 200 : 201);
  } catch (e) {
    if (e instanceof SaleError) return errorJson(e.status, e.code, e.message);
    if (e instanceof StorageError) return errorJson(e.status, e.code, e.status === 503 ? "La carga de comprobantes no está disponible por ahora. Escribinos por WhatsApp." : "No pudimos guardar el archivo. Intentá de nuevo en un momento.");
    throw e;
  }
}
