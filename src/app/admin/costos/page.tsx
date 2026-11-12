import Link from "next/link";
import { AdminAccountingSummary } from "@/components/admin-accounting-summary";
import { AdminForm } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { currentAccountingMonth, parseAccountingPeriod } from "@/features/contabilidad/period";
import { profitReport } from "@/features/costos/service";
import { formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Costos PRIVADOS, compras y ganancia. Esta pantalla es solo del panel: ningún dato de acá llega a páginas públicas ni a respuestas para clientes. */
export default async function AdminCostos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/costos");
  const sp = await searchParams;
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.desde)) ? one(sp.desde) : "";
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.hasta)) ? one(sp.hasta) : "";
  const db = getDb();
  const { period, error } = desde || hasta || sp.todo === "1" ? parseAccountingPeriod(desde, hasta) : { period: currentAccountingMonth().period, error: null };
  const report = await profitReport(db, period);
  const commissionSales = report.rows.filter((r) => r.kind === "venta");
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño · privado</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Ganancia y comisiones</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">El costo de mercadería se guarda con cada venta. Para mayoristas se usan los gastos de su pedido y la cotización guardada allí.</p>

      <p className="mt-3 text-sm"><Link href="/admin/costos-productos" className="font-semibold underline">Editar costos por producto</Link> · <Link href="/admin/compras" className="underline">Gestionar compras e importaciones</Link> · <Link href="/admin/costos?todo=1" className="underline">Ver historial completo</Link></p>
      <section className={card} data-testid="ganancia">
        <h2 className="text-base font-semibold">Ganancia</h2>{error && <p role="alert" className="text-sm text-vermilion">{error}</p>}
        <form className="mt-2 flex flex-wrap items-end gap-3" method="get">
          <div><label htmlFor="g-d" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Desde</label><input id="g-d" type="date" name="desde" defaultValue={period.from ?? ""} className="block min-h-11 rounded-md border border-ink/40 px-3" /></div>
          <div><label htmlFor="g-h" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Hasta</label><input id="g-h" type="date" name="hasta" defaultValue={period.to ?? ""} className="block min-h-11 rounded-md border border-ink/40 px-3" /></div>
          <button className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper">Filtrar</button>
        </form>
        <div className="mt-4"><AdminAccountingSummary report={report} /></div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead><tr className="text-left text-xs text-ink/70"><th className="py-1 pr-2">Operación</th><th className="pr-2 text-right">Venta</th><th className="pr-2 text-right">Descuento</th><th className="pr-2 text-right">Costo</th><th className="pr-2 text-right">Comisión</th><th className="pr-2 text-right">Cobrado</th><th className="text-right">Ganancia</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={`${r.kind}-${r.ref}`} className="border-t border-ink/10 align-top" data-testid="ganancia-fila">
                  <td className="py-1.5 pr-2"><Link href={r.wholesale ? `/admin/pedidos/${r.wholesale.reference}#admin-mayorista-costos` : r.kind === "venta" ? "/admin/ventas" : `/admin/pedidos/${r.ref}`} className="font-mono text-xs underline">{r.ref}</Link> <span className="text-xs text-ink/75">{r.day}</span><span className="block text-xs text-ink/75">{r.label}</span></td>
                  <td className="pr-2 text-right tabular-nums">{formatARS(r.revenueMinor)}</td>
                  <td className="pr-2 text-right tabular-nums">{r.discountMinor ? formatARS(r.discountMinor) : "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{r.costMinor === null ? <b className="text-vermilion">Costo pendiente</b> : formatARS(r.costMinor)}</td>
                  <td className="pr-2 text-right tabular-nums">{r.commissionMinor ? formatARS(r.commissionMinor) : "—"}</td>
                  <td className="pr-2 text-right tabular-nums">{r.collectedMinor === null ? <span className="text-ink/75">Sin registro</span> : formatARS(r.collectedMinor)}</td>
                  <td className="text-right font-semibold tabular-nums">{r.wholesale?.profitUsd != null ? <>{formatUSD(r.wholesale.profitUsd)}{!r.wholesale.complete && <span className="block text-xs font-normal">Preliminar</span>}</> : r.profitMinor === null ? "—" : formatARS(r.profitMinor)}</td>
                </tr>
              ))}
              {report.rows.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-ink/75">No hay operaciones en el período.</td></tr>}
            </tbody>
          </table>
        </div>
        {commissionSales.length > 0 && (
          <div className="mt-4 border-t border-ink/10 pt-4">
            <h3 className="text-sm font-semibold">Cargar una comisión de una venta</h3>
            {commissionSales.some((r) => r.wholesale) && <p className="mt-1 text-xs text-ink/75">Si un pedido mayorista ya tiene una comisión registrada en su detalle, el informe toma la de ese pedido.</p>}
            <AdminForm endpoint="/api/admin/costos" compact fixed={{ action: "commission" }} fields={[
              { name: "saleId", label: "Venta", type: "select", required: true, options: commissionSales.map((r) => ({ value: r.ref, label: `${r.ref} · ${formatARS(r.revenueMinor)}` })) },
              { name: "amountMinor", label: "Comisión", type: "pesos", required: true },
              { name: "note", label: "Nota (opcional)", optional: true },
            ]} submit="Cargar comisión" ok="Comisión cargada." />
          </div>
        )}
      </section>

    </div>
  );
}
