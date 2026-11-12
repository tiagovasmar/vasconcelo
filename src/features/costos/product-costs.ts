import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { catalog } from "@/content/catalog";
import type { Db } from "@/db/client";
import { lockKey, type Tx } from "@/db/lock";
import { adminSettings } from "@/db/schema";
import { SaleError } from "@/features/sales/errors";

const prefix = "product_cost:";
const valueSchema = z.object({ currency: z.enum(["USD", "ARS"]), amountMinor: z.number().int().positive().max(1_000_000_000) });
const inputSchema = valueSchema.extend({
  amountMinor: valueSchema.shape.amountMinor.nullable(),
  productId: z.string(),
  expectedVersion: z.number().int().nonnegative(),
});

export async function listProductCosts(db: Db | Tx, ids: string[]) {
  const costs = new Map<string, { cost: z.infer<typeof valueSchema> | null; version: number }>();
  if (!ids.length) return costs;
  const rows = await db.select().from(adminSettings).where(inArray(adminSettings.key, ids.map((id) => prefix + id)));
  for (const row of rows) {
    const parsed = valueSchema.safeParse(JSON.parse(row.value));
    costs.set(row.key.slice(prefix.length), { cost: parsed.success ? parsed.data : null, version: row.updatedAt });
  }
  return costs;
}

export async function saveProductCost(db: Db, body: unknown, email: string) {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Ingresá un costo mayor que cero o dejá el importe vacío para quitarlo.");
  const { productId, currency, amountMinor, expectedVersion } = parsed.data;
  if (!catalog.products.some((p) => p.id === productId && !p.retired)) throw new SaleError(404, "not_found", "El producto no está en el catálogo editable.");
  const key = prefix + productId;
  return db.transaction(async (tx) => {
    await lockKey(tx, `setting:${key}`);
    const [row] = await tx.select().from(adminSettings).where(eq(adminSettings.key, key));
    if ((row?.updatedAt ?? 0) !== expectedVersion) throw new SaleError(409, "stale", "El costo cambió mientras lo editabas. Recargá la página.");
    const value = JSON.stringify(amountMinor === null ? null : { currency, amountMinor });
    if ((row?.value ?? "null") === value) return { ok: true };
    const values = { value, updatedAt: Math.max(Date.now(), expectedVersion + 1), updatedByEmail: email };
    await tx.insert(adminSettings).values({ key, ...values }).onConflictDoUpdate({ target: adminSettings.key, set: values });
    return { ok: true };
  });
}
