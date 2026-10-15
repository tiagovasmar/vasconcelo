import { getDb } from "@/db/client";
import { previewSale } from "@/features/sales/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Resumen de la venta y cómo quedaría el stock, sin escribir nada. */
export function POST(req: Request) {
  return adminAction(req, "ventas-previa", async ({ body }) => ({ preview: await previewSale(getDb(), body) }));
}
