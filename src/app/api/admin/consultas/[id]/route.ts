import { getDb } from "@/db/client";
import { applyInquiryAction } from "@/features/consultas/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Gestión de una consulta: confirmar/desmarcar contacto, cambiar de estado (con motivo opcional) y agregar notas internas. Nada de esto toca el stock. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return adminAction(req, "consulta-gestion", async ({ user, body }) => {
    const r = await applyInquiryAction(getDb(), id, body, user);
    return { ok: true, changed: r.changed };
  }, { limit: 60 });
}
