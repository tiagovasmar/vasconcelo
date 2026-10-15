import { getDb } from "@/db/client";
import { voidSale } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Anula una venta: devuelve el stock y deja el motivo. La venta original se conserva como «anulada». */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return adminAction(req, "ventas-anular", async ({ user, body }) => {
    const reason = typeof (body as { reason?: unknown } | null)?.reason === "string" ? (body as { reason: string }).reason : "";
    return { ok: true, sale: await voidSale(getDb(), id, reason, user) };
  }, { limit: 20 });
}
