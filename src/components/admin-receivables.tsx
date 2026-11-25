import Link from "next/link";
import type { reservedSalesToCollect } from "@/features/contabilidad/service";
import type { ProfitReport } from "@/features/costos/service";
import { formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";

type ReservedSale = Awaited<ReturnType<typeof reservedSalesToCollect>>[number];

export function AdminReceivables({ report, reservations, filtered }: { report: ProfitReport; reservations: ReservedSale[] | null; filtered: boolean }) {
  const billed = report.rows.filter((row) => row.outstandingMinor > 0);
  const billedSaleIds = new Set(report.rows.filter((row) => row.kind === "venta").map((row) => row.ref));
  const reserved = reservations?.filter((sale) => !billedSaleIds.has(sale.id)) ?? [];
  const reservedMinor = reserved.reduce((sum, sale) => sum + sale.totalMinor, 0);
  const total = report.totals.outstandingMinor + reservedMinor;

  return (
    <section id="por-cobrar" aria-labelledby="por-cobrar-title" className="mt-6 scroll-mt-4 rounded-lg border border-ink/15 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="por-cobrar-title" className="text-lg font-semibold">Por cobrar</h2>
        <p className="font-bold tabular-nums" data-testid="por-cobrar-total">{formatARS(total)} <span className="text-xs font-medium text-ink/70">en pesos o su equivalente</span></p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {reservations && <div className="rounded-md bg-paper-2 p-2.5"><dt>Reservas abiertas</dt><dd className="font-bold">{formatARS(reservedMinor)}</dd></div>}
        <div className="rounded-md bg-paper-2 p-2.5"><dt>Saldo facturado{filtered ? " del período" : ""}</dt><dd className="font-bold">{formatARS(report.totals.outstandingMinor)}</dd></div>
      </dl>
      {reservations && <p className="mt-2 text-xs text-ink/75">Las reservas abiertas se muestran aunque cambies el mes. Se suman a la facturación cuando confirmás el cobro.</p>}
      {reserved.length > 0 && <details className="mt-3 border-t border-ink/10 pt-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Ventas reservadas ({reserved.length})</summary>
        <ul className="mt-1 divide-y divide-ink/10">
          {reserved.map((sale) => (
            <li key={sale.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <div>
                <Link href={`/admin/ventas/${sale.id}`} className="font-semibold underline">{sale.customer || sale.id}</Link>
                <p className="text-xs text-ink/75">{sale.stockFromImport ? "Reserva de importación" : "Entrega agendada"}{sale.scheduledFor ? ` · ${sale.scheduledFor.split("-").reverse().join("/")}` : " · Fecha a coordinar"}</p>
              </div>
              <b className="tabular-nums">{sale.totalUsdMinor === null ? formatARS(sale.totalMinor) : formatUSD(sale.totalUsdMinor)}</b>
            </li>
          ))}
        </ul>
      </details>}
      {billed.length > 0 && <details className="mt-3 border-t border-ink/10 pt-3">
        <summary className="cursor-pointer text-sm font-semibold">Ventas y pedidos facturados con saldo ({billed.length})</summary>
        <ul className="mt-1 divide-y divide-ink/10">
          {billed.map((row) => {
            const orderRef = row.wholesale?.reference ?? (row.kind === "pedido" ? row.ref : null);
            return (
              <li key={row.ref} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <div>
                  <Link href={orderRef ? `/admin/pedidos/${orderRef}` : `/admin/ventas/${row.ref}`} className="font-semibold underline">{row.label || row.ref}</Link>
                  <p className="text-xs text-ink/75">Cobrado {formatARS(row.collectedMinor ?? 0)} · Total {formatARS(row.revenueMinor)}</p>
                </div>
                <b className="tabular-nums">{formatARS(row.outstandingMinor)}</b>
              </li>
            );
          })}
        </ul>
      </details>}
      {!reserved.length && !billed.length && <p className="mt-3 text-sm text-ink/75">No hay cobros pendientes en esta vista.</p>}
    </section>
  );
}
