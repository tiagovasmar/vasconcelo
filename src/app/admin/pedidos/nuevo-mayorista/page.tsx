import Link from "next/link";
import { NewWholesaleOrder } from "@/components/admin-new-wholesale-order";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { applyOverrides, loadOverrides } from "@/features/catalog/overrides";
import { getEffectiveRate } from "@/features/fx/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function NuevoPedidoMayorista() {
  await requireAdmin("/admin/pedidos/nuevo-mayorista");
  const db = getDb();
  const [fx, overrides] = await Promise.all([getEffectiveRate(db), loadOverrides(db)]);
  const products = applyOverrides(catalog.products, overrides).filter((p) => !p.retired && !p.addonOnly)
    .map(({ id, title, sku }) => ({ id, title, sku })).sort((a, b) => a.title.localeCompare(b.title, "es"));
  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-8">
      <Link href="/admin/pedidos?tipo=mayorista" className="text-sm underline">← Pedidos mayoristas</Link>
      <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Nuevo pedido mayorista</h1>
      <p className="mt-2 text-sm text-ink/75">Cargá un pedido recibido por WhatsApp u otro canal. Después podés registrar el pago recibido y generar su enlace de seguimiento.</p>
      <NewWholesaleOrder products={products} rate={fx.rate10k === null ? "" : String(Math.round(fx.rate10k / 100) / 100)} />
    </div>
  );
}
