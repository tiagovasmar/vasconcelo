import { getDb } from "@/db/client";
import { createManualWholesaleOrder } from "@/features/pedidos/mayorista-manual";
import { adminAction } from "@/server/admin-api";

export function POST(req: Request) {
  return adminAction(req, "pedidos-mayoristas", ({ body, user }) => createManualWholesaleOrder(getDb(), body, user));
}
