import { getDb } from "@/db/client";
import { completeScheduledSale } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminAction(req, "ventas-completar", ({ body }) => completeScheduledSale(getDb(), id, body), { limit: 30 });
}
