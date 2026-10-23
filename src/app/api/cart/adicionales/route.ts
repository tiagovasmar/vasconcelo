import { z } from "zod";
import { getDb } from "@/db/client";
import { listAllProducts } from "@/features/catalog/data";
import { currentRate } from "@/features/fx/service";
import { CartItemSchema } from "@/features/inquiries/schemas";
import { previewAddons } from "@/features/promos/adicionales";
import { getComboConfig } from "@/features/promos/settings";
import { errorJson, json, readJson, rateLimited, sameOrigin } from "@/server/http";

export const runtime = "nodejs";

const Body = z.object({ cart: z.array(CartItemSchema).max(30), add: z.array(CartItemSchema).min(1).max(12) });

/**
 * Valida el conjunto «caja + adicionales» de la ficha contra el catálogo vigente y el carrito actual, y devuelve el desglose de lo que se suma.
 * No guarda nada, no reserva ni descuenta stock. Los importes salen del servidor; los precios que mande el navegador solo sirven para avisar cambios.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return errorJson(403, "forbidden", "Origen no permitido.");
  if (await rateLimited(req, "adicionales", Number(process.env.RATE_LIMIT_VALIDATE_PER_MIN || 120), 60)) {
    return errorJson(429, "rate_limited", "Demasiadas solicitudes. Esperá un momento e intentá de nuevo.");
  }
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return errorJson(400, "invalid_input", "La solicitud no es válida.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return errorJson(400, "invalid_input", "Revisá la selección.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const db = getDb();
  const fx = await currentRate(db);
  const [products, combo] = await Promise.all([listAllProducts(fx), getComboConfig(db)]);
  return json(previewAddons(products, combo.config, parsed.data.cart, parsed.data.add));
}
