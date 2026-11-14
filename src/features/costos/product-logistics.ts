import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { productKinds, type ProductKind } from "@/content/schema";
import type { Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { adminSettings } from "@/db/schema";
import { SaleError } from "@/features/sales/errors";

const prefix = "product_logistics:";
const money = z.number().int().nonnegative().max(100_000_000).nullable();
const logisticsSchema = z.object({ shippingMinor: money, customsMinor: money });
const inputSchema = logisticsSchema.extend({
  kind: z.enum(productKinds),
  expectedVersion: z.number().int().nonnegative(),
});

export type ProductLogistics = z.infer<typeof logisticsSchema>;

export async function listProductLogistics(db: Db) {
  const rows = await db.select().from(adminSettings).where(inArray(adminSettings.key, productKinds.map((kind) => prefix + kind)));
  const result = new Map<ProductKind, ProductLogistics & { version: number }>();
  for (const row of rows) {
    const kind = productKinds.find((value) => prefix + value === row.key);
    const parsed = logisticsSchema.safeParse(JSON.parse(row.value));
    if (kind && parsed.success) result.set(kind, { ...parsed.data, version: row.updatedAt });
  }
  return result;
}

export async function saveProductLogistics(db: Db, body: unknown, email: string) {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Ingresá importes válidos en USD para envío y aduana.");
  const { kind, expectedVersion, shippingMinor, customsMinor } = parsed.data;
  const key = prefix + kind;
  return db.transaction(async (tx) => {
    await lockKey(tx, `setting:${key}`);
    const [row] = await tx.select().from(adminSettings).where(eq(adminSettings.key, key));
    const value = JSON.stringify({ shippingMinor, customsMinor });
    if (row?.value === value || (!row && shippingMinor === null && customsMinor === null)) return { ok: true };
    if ((row?.updatedAt ?? 0) !== expectedVersion) throw new SaleError(409, "stale", "Los importes cambiaron mientras editabas. Recargá la página.");
    const values = { value, updatedAt: Math.max(Date.now(), expectedVersion + 1), updatedByEmail: email };
    await tx.insert(adminSettings).values({ key, ...values }).onConflictDoUpdate({ target: adminSettings.key, set: values });
    return { ok: true };
  });
}
