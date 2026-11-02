import { getDb } from "@/db/client";
import { flushOutbox } from "@/features/avisos/outbox";
import { adminAction } from "@/server/admin-api";

export const runtime = "nodejs";

/** Reintento de avisos pendientes o fallidos. Uno ya enviado no se reenvía (el envío se reclama de forma atómica). */
export async function POST(req: Request) {
  return adminAction(req, "avisos", async ({ body }) => {
    const raw = (body as { ids?: unknown } | null)?.ids;
    const ids = Array.isArray(raw) ? raw.map(Number).filter(Number.isInteger) : undefined;
    return flushOutbox(getDb(), { ids });
  });
}
