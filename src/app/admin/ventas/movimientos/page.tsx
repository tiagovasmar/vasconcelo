import Link from "next/link";
import { AdminStockForm, type StockProduct } from "@/components/admin-stock-form";
import { catalog } from "@/content/catalog";
import { getDb } from "@/db/client";
import { adminProducts } from "@/features/catalog/overrides";
import { currentRate } from "@/features/fx/service";
import { cleanReason, listMovements } from "@/features/sales/service";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const KINDS = [
  { id: "", label: "Todos" },
  { id: "entrada", label: "Entradas" },
  { id: "venta", label: "Ventas" },
  { id: "ajuste", label: "Ajustes" },
  { id: "anulacion", label: "Anulaciones" },
] as const;
const KIND_LABEL: Record<string, string> = { entrada: "Entrada", venta: "Venta", ajuste: "Ajuste", anulacion: "Anulación" };
const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

export default async function Movimientos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/ventas/movimientos");
  const sp = await searchParams;
  const kind = KINDS.find((k) => k.id === sp.tipo)?.id ?? "";
  const productId = typeof sp.producto === "string" ? sp.producto.slice(0, 80) : "";
  const product = productId ? catalog.products.find((p) => p.id === productId) : undefined;
  const db = getDb();
  const fx = await currentRate(db);
  const [moves, all] = await Promise.all([listMovements(db, { productId: product?.id, kind: kind || undefined, limit: 300 }), adminProducts(db, catalog.products, fx)]);
  const products: StockProduct[] = all.filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired).map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, stock: a.product.stockQuantity }));
  const href = (k: string) => `/admin/ventas/movimientos?${new URLSearchParams({ ...(product ? { producto: product.id } : {}), ...(k ? { tipo: k } : {}) }).toString()}`;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Movimientos de stock</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Cada entrada, venta, ajuste y anulación queda acá con fecha, motivo, stock antes y después, y quién lo hizo. El historial no se edita ni se borra.</p>
      <nav aria-label="Ventas y stock" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/ventas" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Registrar y ver ventas</Link>
        <Link href="/admin/ventas/movimientos" aria-current="page" className="rounded-full border border-emerald bg-emerald px-4 py-1.5 text-paper">Movimientos de stock</Link>
      </nav>

      <div className="mt-6"><AdminStockForm products={products} /></div>

      <nav aria-label="Filtrar por tipo" className="mt-6 flex flex-wrap gap-2">
        {KINDS.map((k) => <Link key={k.id} href={href(k.id)} aria-current={k.id === kind ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm ${k.id === kind ? "border-emerald bg-emerald text-paper" : "border-ink/30 bg-white hover:border-emerald"}`}>{k.label}</Link>)}
      </nav>
      {product && <p className="mt-3 text-sm">Movimientos de <b>{product.title}</b>. <Link href={href("").replace(/producto=[^&]*&?/, "")} className="underline">Ver todos los productos</Link></p>}

      {moves.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="movimientos-vacio">Todavía no hay movimientos de stock.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-ink/15 bg-white">
          <table className="w-full min-w-[820px] text-left text-sm" data-testid="movimientos">
            <thead className="bg-paper text-xs uppercase tracking-wide text-ink/70">
              <tr><th scope="col" className="px-3 py-2">Cuándo</th><th scope="col" className="px-3 py-2">Tipo</th><th scope="col" className="px-3 py-2">Producto</th><th scope="col" className="px-3 py-2">Variación</th><th scope="col" className="px-3 py-2">Stock</th><th scope="col" className="px-3 py-2">Motivo</th><th scope="col" className="px-3 py-2">Responsable</th></tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {moves.map((m) => (
                <tr key={m.id} data-testid="movimiento">
                  <td className="whitespace-nowrap px-3 py-2">{when(m.createdAt)}</td>
                  <td className="px-3 py-2">{KIND_LABEL[m.kind] ?? m.kind}</td>
                  <td className="px-3 py-2"><Link href={`/admin/ventas/movimientos?producto=${encodeURIComponent(m.productId)}`} className="block font-medium underline-offset-2 hover:underline">{m.title}</Link><span className="font-mono text-xs text-ink/60">{m.sku}</span></td>
                  <td className={`whitespace-nowrap px-3 py-2 font-semibold ${m.delta < 0 ? "text-vermilion" : "text-emerald"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td className="whitespace-nowrap px-3 py-2">{m.stockBefore === null ? "pendiente" : m.stockBefore} → <b>{m.stockAfter}</b></td>
                  <td className="px-3 py-2">{cleanReason(m.reason)}</td>
                  <td className="px-3 py-2">{m.userEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
