import { AdminStorefrontSettings } from "@/components/admin-storefront-settings";
import { getDb } from "@/db/client";
import { readStorefrontConfig } from "@/features/admin/storefront";
import { listProducts } from "@/features/catalog/data";
import { incomingProducts } from "@/features/importaciones/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function StorefrontSettingsPage() {
  await requireAdmin("/admin/tienda");
  const db = getDb();
  const [{ config, version }, products, incoming] = await Promise.all([
    readStorefrontConfig(db), listProducts(), incomingProducts(db),
  ]);
  const options = products.filter((p) => !p.retired).map(({ id, title, sku }) => ({ id, title, sku, automatic: incoming.has(id) }))
    .sort((a, b) => Number(b.automatic || Boolean(config.products[b.id])) - Number(a.automatic || Boolean(config.products[a.id])) || a.title.localeCompare(b.title, "es"));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
      <p className="eyebrow text-emerald">Configuración</p>
      <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Instagram y próximos ingresos</h1>
      <AdminStorefrontSettings initial={config} version={version} options={options} />
    </div>
  );
}
