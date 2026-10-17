import { getDb } from "@/db/client";
import { createManualInquiry } from "@/features/consultas/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Carga una consulta que llegó por otro medio (WhatsApp directo, redes, en persona…). Solo el dueño; idempotente por clave (un doble clic no la duplica). */
export function POST(req: Request) {
  return adminAction(req, "consulta-manual", async ({ user, body }) => {
    const r = await createManualInquiry(getDb(), body, user);
    return { ok: true, id: r.id, replayed: r.replayed };
  }, { limit: 30 });
}
