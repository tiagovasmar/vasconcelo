import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { adminSettings } from "@/db/schema";
import { SaleError } from "@/features/sales/errors";

const prefix = "taobao.supplier:";
export const taobaoRecordId = z.string().min(16).max(64).regex(/^[a-zA-Z0-9-]+$/);
const version = z.number().int().positive();
export const taobaoUrl = z.string().trim().max(2048).refine((value) => {
  try {
    const parsed = new URL(value);
    return /^https:\/\//i.test(value) && parsed.href.length <= 2048 && !parsed.username && !parsed.password && !parsed.port
      && ["taobao.com", "tmall.com", "tb.cn"].some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}, "Pegá un enlace HTTPS válido de Taobao o Tmall.").transform((value) => new URL(value).href);
const fields = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre del proveedor.").max(80),
  url: taobaoUrl,
  note: z.string().trim().max(1000).nullish().transform((value) => value || null),
});
const stored = fields.extend({ archived: z.boolean() });
const action = z.discriminatedUnion("action", [
  fields.extend({ action: z.literal("create"), idempotencyKey: taobaoRecordId }),
  fields.extend({ action: z.literal("edit"), id: taobaoRecordId, version }),
  z.object({ action: z.literal("archive"), id: taobaoRecordId, version, archived: z.boolean() }),
]);

type Supplier = z.output<typeof stored> & { id: string; version: number };

function supplierOf(row: typeof adminSettings.$inferSelect): Supplier | null {
  try {
    const result = stored.safeParse(JSON.parse(row.value));
    return result.success ? { ...result.data, id: row.key.slice(prefix.length), version: row.updatedAt } : null;
  } catch {
    return null;
  }
}

export async function listTaobaoSuppliers(db: Db): Promise<Supplier[]> {
  const rows = await db.select().from(adminSettings).where(like(adminSettings.key, `${prefix}%`));
  return rows.map(supplierOf).filter((supplier) => supplier !== null).sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function getTaobaoSupplier(db: Db, id: string): Promise<Supplier | null> {
  if (!taobaoRecordId.safeParse(id).success) return null;
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, prefix + id));
  return row ? supplierOf(row) : null;
}

export async function saveTaobaoSupplier(db: Db, body: unknown, email: string) {
  const parsed = action.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", parsed.error.issues[0].message);
  const input = parsed.data;
  const now = Date.now();

  if (input.action === "create") {
    const key = prefix + input.idempotencyKey;
    const value = JSON.stringify({ name: input.name, url: input.url, note: input.note, archived: false });
    const added = await db.insert(adminSettings).values({ key, value, updatedAt: now, updatedByEmail: email })
      .onConflictDoNothing({ target: adminSettings.key }).returning({ key: adminSettings.key });
    if (added.length) return { replayed: false };
    const [existing] = await db.select({ value: adminSettings.value }).from(adminSettings).where(eq(adminSettings.key, key));
    if (existing?.value === value) return { replayed: true };
    throw new SaleError(409, "idempotency_conflict", "Esta operación ya se guardó con otros datos. Recargá la lista.");
  }

  const key = prefix + input.id;
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
  const current = row ? supplierOf(row) : null;
  if (!current) throw new SaleError(404, "not_found", "No encontramos ese proveedor.");
  const next = input.action === "archive"
    ? { name: current.name, url: current.url, note: current.note, archived: input.archived }
    : { name: input.name, url: input.url, note: input.note, archived: current.archived };
  const value = JSON.stringify(next);
  if (row.value === value) return { replayed: true };
  const updated = await db.update(adminSettings).set({ value, updatedAt: Math.max(now, current.version + 1), updatedByEmail: email })
    .where(and(eq(adminSettings.key, key), eq(adminSettings.updatedAt, input.version))).returning({ key: adminSettings.key });
  if (!updated.length) throw new SaleError(409, "stale", "El proveedor cambió mientras lo editabas. Recargá la lista.");
  return { replayed: false };
}
