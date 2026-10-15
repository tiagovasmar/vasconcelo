import Link from "next/link";
import { AdminSaleForm, type SaleProduct } from "@/components/admin-sale-form";
import { AdminSalesList } from "@/components/admin-sales-list";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { getLowStock, isLowStock } from "@/features/admin/settings";
import { adminProducts } from "@/features/catalog/overrides";
import { currentRate } from "@/features/fx/service";
import { listSales } from "@/features/sales/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

export default async function Ventas() {
  await requireAdmin("/admin/ventas");
  const db = getDb();
  const [fx, low, sales] = await Promise.all([currentRate(db), getLowStock(db), listSales(db, 30)]);
  const products: SaleProduct[] = (await adminProducts(db, catalog.products, fx))
    .filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired)
    .map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, language: a.product.language, stock: a.product.stockQuantity, priceMinor: a.product.priceMinor, low: isLowStock(a.product.stockQuantity, Boolean(a.product.orderOnly), low.threshold), orderOnly: Boolean(a.product.orderOnly) }));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Ventas</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">
        Registrá acá las ventas que ya cerraste, también las hechas fuera de la web. Al confirmar se guarda la venta y se descuenta el stock <b>una sola vez</b>. Una consulta por WhatsApp o un carrito armado no descuentan nada hasta que las registres.
      </p>
      <nav aria-label="Ventas y stock" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/ventas" aria-current="page" className="rounded-full border border-emerald bg-emerald px-4 py-1.5 text-paper">Registrar y ver ventas</Link>
        <Link href="/admin/ventas/movimientos" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Movimientos de stock</Link>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section aria-labelledby="registrar-title" className="min-w-0">
          <h2 id="registrar-title" className="text-lg font-semibold">Registrar una venta</h2>
          <div className="mt-3"><AdminSaleForm products={products} /></div>
        </section>
        <section aria-labelledby="ultimas-title" className="min-w-0">
          <h2 id="ultimas-title" className="text-lg font-semibold">Últimas ventas</h2>
          <p className="mt-1 text-xs text-ink/65">Las ventas no se editan ni se borran. Si te equivocaste, anulala: devuelve el stock y queda constancia.</p>
          <div className="mt-3"><AdminSalesList sales={sales} /></div>
        </section>
      </div>
    </div>
  );
}
