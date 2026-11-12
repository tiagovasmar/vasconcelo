import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { catalog } from "@/content/catalog";
import { getDb, type Db } from "@/db/client";
import { lockKey } from "@/db/lock";
import { adminSettings } from "@/db/schema";
import { SaleError } from "@/features/sales/errors";

const key = "storefront_display";
const visibility = z.enum(["mostrar", "ocultar"]);
const profileName = /^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/i;

export function instagramProfile(value: string): string | null {
  const input = value.trim();
  if (profileName.test(input.replace(/^@/, ""))) return input.replace(/^@/, "");
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.host) || url.username || url.password) return null;
    const name = url.pathname.replace(/^\/|\/$/g, "");
    return profileName.test(name) ? name : null;
  } catch {
    return null;
  }
}

const configSchema = z.object({
  instagram: z.string().trim().max(300).refine((s) => !s || instagramProfile(s) !== null, "Ingresá el @usuario o el enlace HTTPS del perfil de Instagram."),
  upcomingEnabled: z.boolean(),
  products: z.record(z.string(), visibility),
});
export type StorefrontConfig = z.infer<typeof configSchema>;
const defaults: StorefrontConfig = { instagram: "vasconcelo.tcg", upcomingEnabled: true, products: {} };

export async function readStorefrontConfig(db: Db) {
  const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
  if (row) try {
    const parsed = configSchema.safeParse(JSON.parse(row.value));
    if (parsed.success) return { config: { ...parsed.data, instagram: instagramProfile(parsed.data.instagram) ?? "" }, version: row.updatedAt };
  } catch {
    // El formulario permite volver a guardar el ajuste si el valor almacenado es ilegible.
  }
  return { config: defaults, version: row?.updatedAt ?? 0 };
}

export const storefrontOnce = cache(async () => (await readStorefrontConfig(getDb())).config);

export async function saveStorefrontConfig(db: Db, input: unknown, email: string) {
  const result = configSchema.extend({ expectedVersion: z.number().int().min(0) }).safeParse(input);
  if (!result.success) throw new SaleError(400, "invalid_input", result.error.issues[0]?.message ?? "Revisá la configuración.");
  const { expectedVersion, products, instagram, upcomingEnabled } = result.data;
  const eligible = new Set(catalog.products.filter((p) => !p.retired).map((p) => p.id));
  const currentProducts = Object.fromEntries(Object.entries(products).filter(([id]) => eligible.has(id)));
  const config = { instagram: instagramProfile(instagram) ?? "", upcomingEnabled, products: currentProducts };
  return db.transaction(async (tx) => {
    await lockKey(tx, `setting:${key}`);
    const [row] = await tx.select().from(adminSettings).where(eq(adminSettings.key, key));
    if ((row?.updatedAt ?? 0) !== expectedVersion) throw new SaleError(409, "stale", "La configuración cambió. Recargá la página antes de guardar.");
    const value = JSON.stringify(config);
    if (row?.value === value) return { config, version: row.updatedAt };
    const version = Math.max(Date.now(), expectedVersion + 1);
    const values = { value, updatedAt: version, updatedByEmail: email };
    await tx.insert(adminSettings).values({ key, ...values }).onConflictDoUpdate({ target: adminSettings.key, set: values });
    return { config, version };
  });
}
