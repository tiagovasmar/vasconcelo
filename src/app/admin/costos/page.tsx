import Link from "next/link";
import { AdminButton, AdminForm } from "@/components/admin-form";
import { PurchaseForm } from "@/components/purchase-form";
import { getDb } from "@/db/client";
import { catalog } from "@/content/catalog";
import { dayEndExclusive, dayStart } from "@/features/consultas/service";
import { when } from "@/features/consultas/ui";
import { listPurchases, profitReport } from "@/features/costos/service";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const title = (id: string) => catalog.products.find((p) => p.id === id)?.title ?? id;
const cur = (c: string, minor: number) => `${c} ${(minor / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Costos PRIVADOS, compras y ganancia. Esta pantalla es solo del panel: ningún dato de acá llega a páginas públicas ni a respuestas para clientes. */
export default async function AdminCostos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/costos");
  const sp = await searchParams;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.desde)) ? one(sp.desde) : "";
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.hasta)) ? one(sp.hasta) : "";
  const db = getDb();
  const [purchases, report] = await Promise.all([listPurchases(db), profitReport(db, { from: desde ? dayStart(desde) : undefined, to: hasta ? dayEndExclusive(hasta) : undefined })]);
  const products = catalog.products.filter((p) => p.active || p.retired).map((p) => ({ value: p.id, label: `${p.title} (${p.sku})` }));
  const t = report.totals;
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño · privado</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Costos, compras y ganancia</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Los costos, proveedores y márgenes se ven solo acá. El costo de cada venta se congela cuando se registra: una reposición o un cambio de cotización posterior no modifica la ganancia anterior. Un producto sin compra confirmada figura «Costo pendiente», nunca costo cero.</p>

      <section className={card} data-testid="ganancia">
        <h2 className="text-base font-semibold">Ganancia</h2>
        <form className="mt-2 flex flex-wrap items-end gap-3" method="get">
          <div><label htmlFor="g-d" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Desde</label><input id="g-d" type="date" name="desde" defaultValue={desde} className="block min-h-11 rounded-md border border-ink/40 px-3" /></div>
          <div><label htmlFor="g-h" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Hasta</label><input id="g-h" type="date" name="hasta" defaultValue={hasta} className="block min-h-11 rounded-md border border-ink/40 px-3" /></div>
          <button className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper">Filtrar</button>
        </form>
        <dl className="mt-4 grid gap-3 sm:grid-cols-5">
          {[["Facturado", formatARS(t.billedMinor), "Importe de venta ya con descuentos"], ["Cobrado", formatARS(t.collectedMinor), "Pagos confirmados menos reintegrados (solo ventas con registro de cobro)"], ["Descuentos", formatARS(t.discountMinor), "Promociones aplicadas"], ["Comisiones", formatARS(t.commissionMinor), "Cargadas a mano"], ["Ganancia calculada", formatARS(t.profitMinor), t.pendingCostRows ? `Sin contar ${t.pendingCostRows} con costo pendiente` : "Venta − costo − comisiones"]].map(([l, v, h]) => (
            <div key={l} className="rounded-lg bg-paper-2 p-3"><dt className="text-xs font-semibold uppercase tracking-wide text-ink/65">{l}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{v}</dd><dd className="mt-0.5 text-xs text-ink/60">{h}</dd></div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead><tr className="text-left text-xs text-ink/70"><th className="py-1 pr-2">Operación</th><th className="pr-2 text-right">Venta</th><th className="pr-2 text-right">Descuento</th><th className="pr-2 text-right">Costo</th><th className="pr-2 text-right">Comisión</th><th className="pr-2 text-right">Cobrado</th><th className="text-right">Ganancia</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={`${r.kind}-${r.ref}`} className="border-t border-ink/10 align-top" data-testid="ganancia-fila">
                  <td className="py-1.5 pr-2"><Link href={r.kind === "venta" ? `/admin/ventas` : `/admin/pedidos/${r.ref}`} className="font-mono text-xs underline">{r.ref}</Link> <span className="text-xs text-ink/60">{when(r.at)}</span><span className="block text-xs text-ink/65">{r.label}</span></td>
                  <td className="pr-2 text-right tabular-nums">{formatARS(r.revenueMinor)}</td>
                  <td className="pr-2 text-right tabular-nums">{r.discountMinor ? formatARS(r.discountMinor) : "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{r.costMinor === null ? <b className="text-vermilion">Costo pendiente</b> : formatARS(r.costMinor)}</td>
                  <td className="pr-2 text-right tabular-nums">{r.commissionMinor ? formatARS(r.commissionMinor) : "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{r.collectedMinor === null ? <span className="text-ink/55">Sin registro</span> : formatARS(r.collectedMinor)}</td>
                  <td className="text-right font-semibold tabular-nums">{r.profitMinor === null ? "—" : formatARS(r.profitMinor)}</td>
                </tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-ink/60">No hay operaciones en el período.</td></tr>}
            </tbody>
          </table>
        </div>
        {report.rows.some((r) => r.kind === "venta") && (
          <div className="mt-4 border-t border-ink/10 pt-4">
            <h3 className="text-sm font-semibold">Cargar una comisión de una venta</h3>
            <AdminForm endpoint="/api/admin/costos" compact fixed={{ action: "commission" }} fields={[
              { name: "saleId", label: "Venta", type: "select", required: true, options: report.rows.filter((r) => r.kind === "venta").map((r) => ({ value: r.ref, label: `${r.ref} · ${formatARS(r.revenueMinor)}` })) },
              { name: "amountMinor", label: "Comisión", type: "pesos", required: true },
              { name: "note", label: "Nota (opcional)", optional: true },
            ]} submit="Cargar comisión" ok="Comisión cargada." />
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-base font-semibold">Registrar una compra o lote</h2>
        <div className="mt-3"><PurchaseForm products={products} /></div>
      </section>

      <section className={card} data-testid="compras">
        <h2 className="text-base font-semibold">Compras</h2>
        {purchases.length === 0 ? <p className="mt-2 text-sm text-ink/60">Todavía no cargaste compras.</p> : purchases.map((p) => (
          <article key={p.id} className="mt-4 rounded-lg border border-ink/15 p-3" data-testid="compra">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">{p.supplier} · {when(p.purchasedAt)} <span className="font-mono text-xs text-ink/55">{p.id}</span></h3>
              <span className="rounded-full bg-gold/30 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-gold">{p.status === "confirmada" ? "Confirmada · costos congelados" : "Borrador"}</span>
            </div>
            <p className="text-xs text-ink/65">Moneda {p.currency}{p.rateToArs10k ? ` · cotización usada $${(p.rateToArs10k / 10_000).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ""}{p.rateNote ? ` (${p.rateNote})` : ""}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-ink/70"><th className="py-1 pr-2">Producto</th><th className="pr-2 text-right">Cant.</th><th className="pr-2 text-right">Precio original</th><th className="pr-2 text-right">Gastos repartidos</th><th className="pr-2 text-right">Costo total</th><th className="text-right">Costo final por unidad</th></tr></thead>
                <tbody>{p.items.map((i) => <tr key={i.id} className="border-t border-ink/10"><td className="py-1 pr-2">{title(i.productId)}</td><td className="pr-2 text-right">{i.quantity}</td><td className="pr-2 text-right">{cur(p.currency, i.unitPriceOriginalMinor)}</td><td className="pr-2 text-right">{i.allocatedExpensesMinor === null ? "—" : formatARS(i.allocatedExpensesMinor)}</td><td className="pr-2 text-right">{i.totalCostMinor === null ? "—" : formatARS(i.totalCostMinor)}</td><td className="text-right font-semibold">{i.finalUnitCostMinor === null ? "Se calcula al confirmar" : formatARS(i.finalUnitCostMinor)}</td></tr>)}</tbody>
              </table>
            </div>
            {p.expenses.length > 0 && <ul className="mt-2 text-xs text-ink/75">{p.expenses.map((e) => <li key={e.id}>{e.kind}{e.description ? ` (${e.description})` : ""}: {formatARS(e.amountMinor)} · regla de reparto: <b>{e.allocation}</b>{e.shares.length > 0 && <> → {e.shares.map((s, k) => formatARS(s.shareMinor) + (k < e.shares.length - 1 ? " + " : "")).join("")}</>}</li>)}</ul>}
            {p.status === "borrador" && <div className="mt-3"><AdminButton endpoint="/api/admin/costos" body={{ action: "confirm_purchase", purchaseId: p.id }} label="Confirmar y calcular costos" ok="Compra confirmada." confirmText="Al confirmar se calculan y congelan los costos. ¿Continuar?" /></div>}
          </article>
        ))}
      </section>
    </div>
  );
}
