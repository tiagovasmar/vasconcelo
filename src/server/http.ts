import "server-only";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import { allowRequest } from "@/features/inquiries/service";

export const SESSION_COOKIE = "consulta_sid";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function errorJson(status: number, code: string, message: string, details?: unknown) {
  return json({ error: { code, message, details } }, status);
}

/** Protección de origen: si el navegador manda Origin, debe coincidir con el host del servidor. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // clientes sin Origin (p. ej. pruebas de servidor); los navegadores siempre lo envían en POST
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

export async function readJson(req: Request, maxBytes = 20_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too_large");
  return JSON.parse(text);
}

/** Límite persistente por IP (hasheada) y acción. La IP no se guarda en claro. */
export async function rateLimited(req: Request, action: string, limit: number, windowSeconds: number): Promise<boolean> {
  // En Netlify la IP del visitante llega en `x-nf-client-connection-ip` (la pone la plataforma); si no está, el primer valor de x-forwarded-for.
  const ip = (req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const who = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  try {
    return !(await allowRequest(getDb(), `${action}:${who}`, limit, windowSeconds));
  } catch {
    // Base ocupada o sin respuesta un instante: no se rechaza la petición por un fallo del contador; la validación real sigue en el servicio.
    return false;
  }
}
