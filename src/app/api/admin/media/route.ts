import { getDb } from "@/db/client";
import { adminFromRequest } from "@/server/admin";
import { errorJson, json, rateLimited, sameOrigin } from "@/server/http";
import { MAX_UPLOAD_BYTES, MediaError, storeUpload } from "@/server/media";

export const runtime = "nodejs";

/**
 * Sube UNA foto desde el panel (multipart, campo «file»). Solo el dueño configurado; el archivo se valida por su contenido real,
 * se optimiza y se guarda con un nombre generado por el servidor. Devuelve la ruta pública para sumarla a la galería de un producto.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  if (await rateLimited(req, "admin-subir", 40, 60)) return errorJson(429, "rate_limited", "Demasiadas subidas seguidas. Esperá un momento.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 200_000) return errorJson(413, "too_large", `La imagen pesa más de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es un formulario válido.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return errorJson(400, "invalid_input", "Falta el archivo (campo «file»).");
  try {
    const stored = await storeUpload(getDb(), { data: Buffer.from(await file.arrayBuffer()), originalName: file.name, uploadedByEmail: auth.user.email });
    return json({ ok: true, image: stored });
  } catch (e) {
    if (e instanceof MediaError) return errorJson(e.status, e.code, e.message);
    throw e;
  }
}
