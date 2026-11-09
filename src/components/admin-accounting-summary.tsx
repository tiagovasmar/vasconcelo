import type { ProfitReport } from "@/features/costos/service";
import { formatARS } from "@/lib/format";

export function AdminAccountingSummary({ report }: { report: ProfitReport }) {
  const { totals, rows } = report;
  const gain = rows.length > 0 && totals.pendingCostRows === rows.length ? "Pendiente" : formatARS(totals.profitMinor);
  const items = [
    ["Vendido", formatARS(totals.billedMinor)],
    ["Cobrado", formatARS(totals.collectedMinor)],
    ["Por cobrar", formatARS(totals.outstandingMinor)],
    ["Ganancia calculada", gain],
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Resumen del período">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md bg-paper-2 p-2.5">
            <dt className="text-xs font-semibold text-ink/75">{label}</dt>
            <dd className="mt-1 break-words text-base font-bold tabular-nums sm:text-lg">{value}</dd>
          </div>
        ))}
      </dl>
      {totals.pendingCostRows > 0 && <p className="mt-2 text-xs text-ink/75">Quedan {totals.pendingCostRows} operaciones con costos o conversión a pesos pendientes. Se excluyen de la ganancia calculada.</p>}
    </>
  );
}
