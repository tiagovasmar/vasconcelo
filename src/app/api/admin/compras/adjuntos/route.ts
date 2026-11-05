import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { lockKey } from "@/db/lock";
import { costPurchases, importDocuments } from "@/db/schema";
import { MAX_RECEIPT_BYTES, sniffReceiptType } from "@/features/pedidos/pagos";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, sameOrigin } from "@/server/http";
import { getReceiptStore } from "@/server/receipt-store";
import { StorageError } from "@/server/storage";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "compras-adjuntos", 20, 60)) return errorJson(429, "rate_limited", "Esperá antes de subir otro archivo.");
  if (Number(req.headers.get("content-length")) > MAX_RECEIPT_BYTES + 16_384) return errorJson(413, "too_large", "Máximo 4 MB por archivo.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const purchaseId = form?.get("purchaseId");
  if (!(file instanceof File) || typeof purchaseId !== "string" || purchaseId.length > 80) return errorJson(400, "invalid_input", "Elegí una compra y un archivo.");
  if (file.size > MAX_RECEIPT_BYTES) return errorJson(413, "too_large", "Máximo 4 MB por archivo.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffReceiptType(buffer);
  if (!mime) return errorJson(415, "unsupported", "Adjuntá un PDF, JPG, PNG o WebP.");
  const id = "compra-" + createHash("sha256").update(purchaseId).update("\0").update(buffer).digest("hex");
  try {
    return await getDb().transaction(async (tx) => {
      await lockKey(tx, `cost-purchase:${purchaseId}`);
      const [purchase] = await tx.select({ id: costPurchases.id }).from(costPurchases).where(eq(costPurchases.id, purchaseId));
      if (!purchase) return errorJson(404, "not_found", "La compra no existe.");
      const [existing] = await tx.select({ id: importDocuments.id }).from(importDocuments).where(eq(importDocuments.id, id));
      if (existing) return json({ id, replayed: true });
      const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(importDocuments).where(eq(importDocuments.purchaseId, purchaseId));
      if (count.n >= 20) return errorJson(409, "order_rule", "La compra admite hasta 20 adjuntos.");
      const store = getReceiptStore();
      if (!await store.get(id)) await store.put(id, buffer, mime);
      await tx.insert(importDocuments).values({ id, purchaseId, mime, filename: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 80) || "adjunto", createdAt: Date.now() });
      return json({ id });
    });
  } catch (e) {
    if (e instanceof StorageError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}

export async function GET(req: Request) {
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^compra-[a-f0-9]{64}$/.test(id)) return errorJson(404, "not_found", "El adjunto no existe.");
  const [document] = await getDb().select().from(importDocuments).where(eq(importDocuments.id, id));
  if (!document) return errorJson(404, "not_found", "El adjunto no existe.");
  try {
    const bytes = await getReceiptStore().get(id);
    if (!bytes) return errorJson(404, "not_found", "El archivo no está disponible.");
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": document.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (e) {
    if (e instanceof StorageError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
