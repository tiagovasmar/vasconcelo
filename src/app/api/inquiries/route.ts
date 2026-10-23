import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { getWhatsappNumber } from "@/features/inquiries/config";
import { createInquiry, hashToken, InquiryError, launchFor, newSessionToken } from "@/features/inquiries/service";
import { SESSION_COOKIE, errorJson, json, readJson, rateLimited, sameOrigin } from "@/server/http";
import { userFromRequest } from "@/server/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "consultas", Number(process.env.RATE_LIMIT_INQUIRIES_PER_HOUR || 60), 3600)) {
    return errorJson(429, "rate_limited", "Hiciste muchas consultas seguidas. Esperá un rato e intentá de nuevo.");
  }
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }

  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  const hadSession = Boolean(existing && /^[A-Za-z0-9_-]{20,64}$/.test(existing));
  const token = hadSession ? existing! : newSessionToken();

  try {
    // El vínculo con una cuenta sale SIEMPRE de la sesión autenticada, nunca del body.
    const user = await userFromRequest(req);
    const { inquiry, replayed } = await createInquiry(getDb(), body, { sessionTokenHash: hashToken(token), userId: user?.id ?? null, sessionIsNew: !hadSession });
    const number = getWhatsappNumber();
    const launch = launchFor(inquiry, number);
    const res = json({
      reference: inquiry.reference,
      status: inquiry.status,
      replayed,
      whatsapp: { configured: Boolean(number), mode: launch.mode, url: launch.url, text: launch.text },
      message: inquiry.message,
      subtotalMinor: inquiry.subtotalMinor,
    }, replayed ? 200 : 201);
    res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return res;
  } catch (e) {
    if (e instanceof InquiryError) return errorJson(e.info.status, e.info.code, e.info.message, e.info.details);
    console.error("[consulta] error inesperado al preparar la consulta"); // sin contenido del pedido ni datos personales
    return errorJson(500, "persistence_error", "No pudimos guardar tu consulta. Intentá de nuevo.");
  }
}
