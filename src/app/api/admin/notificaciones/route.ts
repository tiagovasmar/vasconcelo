import { z } from "zod";
import { getDb } from "@/db/client";
import { countUnreadAdminNotices, markAdminNoticesRead, NOTICE_PAGE_SIZE } from "@/features/admin/notifications";
import { SaleError } from "@/features/sales/errors";
import { adminFromRequest } from "@/server/admin";
import { adminAction } from "@/server/admin-api";
import { errorJson, json } from "@/server/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await adminFromRequest(req);
  if (!("user" in auth)) return errorJson(auth.status, auth.code, auth.message);
  return json({ unread: await countUnreadAdminNotices(getDb(), auth.user.id) });
}

const readSchema = z.object({ keys: z.array(z.string().min(3).max(180).regex(/^[\w:-]+$/)).min(1).max(NOTICE_PAGE_SIZE) });

export function POST(req: Request) {
  return adminAction(req, "notificaciones", async ({ user, body }) => {
    const parsed = readSchema.safeParse(body);
    if (!parsed.success) throw new SaleError(400, "invalid_input", "Elegí las notificaciones que querés marcar como leídas.");
    const db = getDb();
    await markAdminNoticesRead(db, user, parsed.data.keys);
    return { unread: await countUnreadAdminNotices(db, user.id) };
  });
}
