import { getDb } from "@/db/client";
import { saveTaobaoSupplier } from "@/features/admin/taobao-suppliers";
import { adminAction } from "@/server/admin-api";

export function POST(req: Request) {
  return adminAction(req, "proveedores", ({ user, body }) => saveTaobaoSupplier(getDb(), body, user.email));
}
