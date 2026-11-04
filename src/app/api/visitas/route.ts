import { z } from "zod";
import { getDb } from "@/db/client";
import { storefrontVisits } from "@/db/schema";
import { json, rateLimited, readJson, sameOrigin } from "@/server/http";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false }, 403);
  const input = z.object({ browser: z.uuid() }).safeParse(await readJson(req).catch(() => null));
  if (!input.success) return json({ ok: false }, 400);
  if (await rateLimited(req, "visita-tienda", 60, 60)) return json({ ok: false }, 429);
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  await getDb().insert(storefrontVisits).values({ day, browser: input.data.browser }).onConflictDoNothing();
  return new Response(null, { status: 204 });
}
