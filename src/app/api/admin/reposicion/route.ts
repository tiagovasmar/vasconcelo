import { getDb } from "@/db/client";
import { flushQuietly } from "@/features/avisos/outbox";
import { notifyRestock } from "@/features/avisos/reposicion";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** El dueño avisa que repuso un producto: encola un correo por persona anotada (solo si hay stock cargado). */
export async function POST(req: Request) {
  return adminAction(req, "reposicion", async ({ user, body }) => {
    const db = getDb();
    const r = await notifyRestock(db, String((body as { productId?: unknown } | null)?.productId ?? ""), { id: user.id, email: user.email });
    await flushQuietly(db);
    return r;
  });
}
