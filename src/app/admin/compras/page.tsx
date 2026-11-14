import { importProgress } from "@/features/importaciones/service";
import { SHIPMENT_LABEL, SHIPMENT_STATUSES, shipmentRank } from "@/features/pedidos/etapas";
import Link from "next/link";
import { purchaseProducts } from "./products";
import { getDb } from "@/db/client";
import { listTaobaoSuppliers } from "@/features/admin/taobao-suppliers";
import { listPurchases } from "@/features/costos/service";
import { quoteAmount } from "@/lib/taobao-quote";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { PurchaseForm } from "@/components/purchase-form";

const field = "w-full min-w-0 rounded-lg border border-ink/40 bg-white p-2.5";
const dateOf = (date: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(date);

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/compras");
  const params = await searchParams;
  const get = (key: string) => typeof params[key] === "string" ? params[key] : "";
  const q = get("q").trim().toLowerCase();
  const supplier = get("proveedor").trim().toLowerCase();
  const from = get("desde");
  const to = get("hasta");
  const status = get("estado");
  const awaitingReceipt = get("recepcion") === "pendiente";
  const labels = new Map(purchaseProducts().map((p) => [p.value, p.label]));
  const db = getDb();
  const [records, progress, suppliers] = await Promise.all([listPurchases(db), importProgress(db), listTaobaoSuppliers(db)]);
  const supplierNames = [...new Set(suppliers.filter((supplier) => !supplier.archived).map((supplier) => supplier.name))];
  const stages: Record<string, string> = { registrada: "Compra registrada", comprada: "Comprada al proveedor", ...SHIPMENT_LABEL, finalizada: "Recepción revisada y finalizada" };
  const purchases = records.map((p) => {
    const parts = progress.get(p.id) ?? [];
    const total = p.items.reduce((n, i) => n + i.quantity, 0);
    const loaded = parts.reduce((n, r) => n + r.quantity, 0);
    const reviewed = parts.reduce((n, r) => n + r.reviewed, 0);
    const first = Math.min(...parts.filter((r) => r.quantity > 0).map((r) => shipmentRank(r.status)));
    const stage = !p.orderedAt ? "registrada" : reviewed === total ? "finalizada" : loaded === total && first > 0 ? SHIPMENT_STATUSES[first] : "comprada";
    return { ...p, total, stage, awaitingReceipt: parts.some((part) => part.status !== "preparando" && part.reviewed < part.quantity) };
  }).filter((p) =>
    (!q || [p.id, p.reference, p.supplier, ...p.items.map((i) => labels.get(i.productId))].some((v) => v?.toLowerCase().includes(q))) &&
    (!supplier || p.supplier.toLowerCase().includes(supplier)) && (!from || dateOf(p.purchasedAt) >= from) && (!to || dateOf(p.purchasedAt) <= to) &&
    (!status || (status === p.stage || status === p.status)) && (!awaitingReceipt || p.awaitingReceipt));
  return (
    <div className="mx-auto max-w-[1080px] space-y-6 px-4 py-8 sm:px-8">
      <header>
        <p className="eyebrow text-emerald">Panel del dueño · privado</p>
        <h1 className="mt-2 text-3xl font-semibold">Compras e importaciones</h1>
        <p className="mt-2 text-sm text-ink/75">Guardá cada pedido al proveedor con su fecha y sus productos. Cuando la mercadería salga del almacén, agrupá las compras en Despachos.</p>
        <Link href="/admin/envios" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Ir a Despachos</Link>
      </header>
      <details open={get("nueva") === "1" || undefined} className="rounded-xl border border-ink/20 bg-white p-4">
        <summary className="cursor-pointer font-semibold">+ Registrar compra</summary>
        <div className="mt-4">
          <Link href="/admin/proveedores" className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Ver proveedores guardados</Link>
          <PurchaseForm products={purchaseProducts()} supplierNames={supplierNames} managed />
        </div>
      </details>
      <section className="rounded-xl border border-ink/20 bg-white p-4">
        <h2 className="text-lg font-semibold">Compras registradas</h2>
        {awaitingReceipt && <p className="mt-2 text-sm"><b>Compras por recibir</b> · <Link href="/admin/compras" className="underline">Quitar filtro</Link></p>}
        <form className="my-4 grid gap-3 sm:grid-cols-3">
          {awaitingReceipt && <input type="hidden" name="recepcion" value="pendiente" />}
          <label className="min-w-0 text-sm">Buscar<input name="q" defaultValue={q} placeholder="Referencia, producto o SKU" className={field} /></label>
          <label className="min-w-0 text-sm">Proveedor<input name="proveedor" defaultValue={supplier} className={field} /></label>
          <label className="min-w-0 text-sm">Estado<select name="estado" defaultValue={status} className={field}>
            <option value="">Todos</option><option value="borrador">Costos abiertos</option><option value="confirmada">Costos cerrados</option>{Object.entries(stages).filter(([stage]) => stage !== "preparando").map(([stage, label]) => <option value={stage} key={stage}>{label}</option>)}
          </select></label>
          <label className="min-w-0 text-sm">Desde<input type="date" name="desde" defaultValue={from} className={field} /></label>
          <label className="min-w-0 text-sm">Hasta<input type="date" name="hasta" defaultValue={to} className={field} /></label>
          <button className="self-end rounded-lg bg-ink p-2.5 font-semibold text-paper">Filtrar</button>
        </form>
        {purchases.length === 0 && <p className="text-sm text-ink/70">No hay compras para estos filtros.</p>}
        <ul className="divide-y divide-ink/15">
          {purchases.map((p) => {
            const subtotal = p.items.reduce((sum, i) => sum + i.unitPriceOriginalMinor * i.quantity, 0);
            return <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 break-words">
              <Link href={`/admin/compras/${p.id}`} className="font-semibold underline underline-offset-4">{p.supplier}{p.reference && ` · ${p.reference}`}</Link>
              <p className="mt-1 text-xs text-ink/70">{p.id} · {dateOf(p.purchasedAt)} · {p.total} unidades</p>
              <p className="mt-1 text-sm">Subtotal de productos <b>{p.currency === "ARS" ? formatARS(subtotal) : quoteAmount(subtotal, p.currency === "USD" ? "USD" : "RMB")}</b></p>
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer underline">Ver productos ({p.items.length})</summary>
                <ul className="mt-1 space-y-1">{p.items.map((item) => <li key={item.id}>{item.quantity} × {labels.get(item.productId) ?? item.productId}</li>)}</ul>
              </details>
            </div>
            <span className="rounded-full bg-paper-2 px-3 py-1 text-xs">{stages[p.stage]} · {p.status === "confirmada" ? "Costos cerrados" : "Costos abiertos"}</span>
          </li>;
          })}
        </ul>
      </section>
    </div>
  );
}
