import "server-only";
import { and, eq, like } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import type { Db } from "@/db/client";
import { adminSettings } from "@/db/schema";
import { getTaobaoSupplier, taobaoRecordId, taobaoUrl } from "@/features/admin/taobao-suppliers";
import { SaleError } from "@/features/sales/errors";
import { MAX_QUOTE_PHOTO_EDGE, MAX_QUOTE_PHOTO_URL, MAX_QUOTE_RATE, MAX_QUOTE_VARIANTS, MIN_QUOTE_RATE } from "@/lib/taobao-quote";

const prefix = (supplierId: string) => `taobao.quote:${supplierId}:`;
const money = z.number().int().min(0).max(100_000_000);
const variant = z.object({
  name: z.string().trim().min(1).max(120),
  rmb: money.min(1),
  logisticsUsd: money.nullable(),
  photo: z.string().max(MAX_QUOTE_PHOTO_URL).regex(/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/).nullable(),
});
const fields = z.object({
  url: taobaoUrl,
  title: z.string().trim().min(2).max(120),
  note: z.string().trim().max(2000),
  rate: z.number().int().min(MIN_QUOTE_RATE).max(MAX_QUOTE_RATE),
  rateDate: z.iso.date().nullable(),
  variants: z.array(variant).min(1).max(MAX_QUOTE_VARIANTS),
});
const action = fields.extend({
  supplierId: taobaoRecordId,
  id: taobaoRecordId,
  version: z.number().int().positive().optional(),
});

export type TaobaoQuote = z.output<typeof fields> & { id: string; version: number };

export async function listTaobaoQuotes(db: Db, supplierId: string): Promise<TaobaoQuote[]> {
  if (!taobaoRecordId.safeParse(supplierId).success) return [];
  const keyPrefix = prefix(supplierId);
  const rows = await db.select().from(adminSettings).where(like(adminSettings.key, `${keyPrefix}%`));
  return rows.flatMap((row) => {
    try {
      const result = fields.safeParse(JSON.parse(row.value));
      return result.success ? [{ ...result.data, id: row.key.slice(keyPrefix.length), version: row.updatedAt }] : [];
    } catch {
      return [];
    }
  }).sort((a, b) => b.version - a.version);
}

async function validatePhoto(photo: string) {
  try {
    const image = sharp(Buffer.from(photo.slice("data:image/webp;base64,".length), "base64"), { limitInputPixels: MAX_QUOTE_PHOTO_EDGE ** 2 });
    const meta = await image.metadata();
    if (meta.format === "webp" && (meta.pages ?? 1) === 1 && meta.width <= MAX_QUOTE_PHOTO_EDGE && meta.height <= MAX_QUOTE_PHOTO_EDGE) {
      await image.raw().toBuffer();
      return;
    }
  } catch {
    // Sharp rechaza los archivos dañados.
  }
  throw new SaleError(400, "invalid_input", "Una de las fotos no es válida. Volvé a seleccionarla.");
}

export async function saveTaobaoQuote(db: Db, body: unknown, email: string) {
  const parsed = action.safeParse(body);
  if (!parsed.success) throw new SaleError(400, "invalid_input", "Revisá el enlace, la cotización y los datos de cada variante.");
  const { supplierId, id, version, ...quote } = parsed.data;
  const supplier = await getTaobaoSupplier(db, supplierId);
  if (!supplier) throw new SaleError(404, "not_found", "No encontramos ese proveedor.");
  if (supplier.archived) throw new SaleError(409, "order_rule", "Restaurá el proveedor para editar sus cotizaciones.");
  await Promise.all(quote.variants.flatMap(({ photo }) => photo ? [validatePhoto(photo)] : []));

  const key = prefix(supplierId) + id;
  const value = JSON.stringify(quote);
  const now = Date.now();
  const changed = version === undefined
    ? await db.insert(adminSettings).values({ key, value, updatedAt: now, updatedByEmail: email }).onConflictDoNothing().returning({ key: adminSettings.key })
    : await db.update(adminSettings).set({ value, updatedAt: Math.max(now, version + 1), updatedByEmail: email })
      .where(and(eq(adminSettings.key, key), eq(adminSettings.updatedAt, version))).returning({ key: adminSettings.key });
  if (changed.length) return { replayed: false };
  const [existing] = await db.select({ value: adminSettings.value }).from(adminSettings).where(eq(adminSettings.key, key));
  if (existing?.value === value) return { replayed: true };
  throw new SaleError(409, "stale", "La cotización cambió. Recargá la página antes de guardar.");
}
