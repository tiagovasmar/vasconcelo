import { getDb } from "@/db/client";
import { registerExpense } from "@/features/contabilidad/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

export function POST(req: Request) {
  return adminAction(req, "contabilidad-gastos", async ({ user, body }) => registerExpense(getDb(), body, user.email), { limit: 30 });
}
