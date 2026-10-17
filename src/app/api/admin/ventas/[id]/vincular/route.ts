import { getDb } from "@/db/client";
import { linkSaleToInquiry, SaleError } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Vincula una venta YA registrada (que ya descontó su stock) a una consulta. No toca el stock. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return adminAction(req, "ventas-vincular", async ({ user, body }) => {
    const inquiryId = typeof (body as { inquiryId?: unknown } | null)?.inquiryId === "string" ? (body as { inquiryId: string }).inquiryId.trim() : "";
    if (!inquiryId) throw new SaleError(400, "invalid_input", "Elegí la consulta.");
    const r = await linkSaleToInquiry(getDb(), id, inquiryId, user);
    return { ok: true, replayed: r.replayed, sale: r.sale };
  }, { limit: 30 });
}
