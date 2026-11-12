import { getDb } from "@/db/client";
import { saveTaobaoQuote } from "@/features/admin/taobao-quotes";
import { adminAction } from "@/server/admin-api";

export function POST(req: Request) {
  return adminAction(req, "proveedores-cotizaciones", ({ user, body }) => saveTaobaoQuote(getDb(), body, user.email), { bodyLimit: 460_000 });
}
