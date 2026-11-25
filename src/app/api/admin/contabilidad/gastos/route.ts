import { getDb } from "@/db/client";
import { markExpensePaid, registerExpense } from "@/features/contabilidad/service";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

export function POST(req: Request) {
  return adminAction(req, "contabilidad-gastos", async ({ user, body }) => registerExpense(getDb(), body, user.email), { limit: 30 });
}

export function PATCH(req: Request) {
  return adminAction(req, "contabilidad-gastos-pagar", async ({ body }) => markExpensePaid(getDb(), body), { limit: 30 });
}
