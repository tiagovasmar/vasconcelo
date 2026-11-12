import Link from "next/link";
import { AccountingChart } from "@/components/accounting-chart";
import { AdminAccountingSummary } from "@/components/admin-accounting-summary";
import { averageCosts, profitReport } from "@/features/costos/service";
import { listProductCosts } from "@/features/costos/product-costs";
import { formatUSD } from "@/features/fx/convert";
import proposal from "@/content/real/propuesta-mayorista.json";
import { AdminForm } from "@/components/admin-form";
import { currentAccountingMonth, parseAccountingPeriod } from "@/features/contabilidad/period";
import { accountingOverview } from "@/features/contabilidad/service";
import { formatARS } from "@/lib/format";
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

export default async function Ventas({ searchParams }: { searchParams: Promise<{ mes?: string | string[]; desde?: string | string[]; hasta?: string | string[] }> }) {
  await requireAdmin("/admin/ventas");
  const db = getDb();
  const { mes, desde, hasta } = await searchParams;
  const { month: currentMonth } = currentAccountingMonth();
  const selectedMonth = mes ?? (desde || hasta ? undefined : currentMonth);
  const monthStart = typeof selectedMonth === "string" ? `${selectedMonth}-01` : undefined;
  const monthDate = monthStart && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(monthStart)
    ? new Date(`${monthStart}T00:00:00Z`)
    : undefined;
  monthDate?.setUTCMonth(monthDate.getUTCMonth() + 1, 0);
  const monthEnd = monthDate?.toISOString().slice(0, 10);
  const { period, error } = selectedMonth === "todo"
    ? parseAccountingPeriod(undefined, undefined)
    : selectedMonth !== undefined
      ? parseAccountingPeriod(monthStart ?? "inválido", monthEnd)
      : parseAccountingPeriod(desde, hasta);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  const months = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(`${currentMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - index);
    return date.toISOString().slice(0, 7);
  });
  if (typeof selectedMonth === "string" && monthEnd && !months.includes(selectedMonth)) months.push(selectedMonth);
  const filtered = Boolean(period.from || period.to);
  const ids = catalog.products.map((product) => product.id);
  const [fx, low, sales, overview, costs, report, manualCosts] = await Promise.all([currentRate(db), getLowStock(db), listSales(db, 30, period), accountingOverview(db, period), averageCosts(db, ids), profitReport(db, period), listProductCosts(db, ids)]);
  const billing = new Map<string, number>();
  for (const row of report.rows) billing.set(row.day, (billing.get(row.day) ?? 0) + row.revenueMinor);
  const reportQuery = new URLSearchParams({ ...(period.from ? { desde: period.from } : {}), ...(period.to ? { hasta: period.to } : {}), ...(!filtered ? { todo: "1" } : {}) });
  const products: SaleProduct[] = (await adminProducts(db, catalog.products, fx))
    .filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired)
    .map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, language: a.product.language, stock: a.product.stockQuantity, priceMinor: a.product.priceMinor, low: isLowStock(a.product.stockQuantity, Boolean(a.product.orderOnly), low.threshold), orderOnly: Boolean(a.product.orderOnly), packSize: a.product.packSize ?? null }));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Contabilidad</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">
        Registrá acá las ventas que ya cerraste, también las hechas fuera de la web. Al confirmar se guarda la venta y se descuenta el stock <b>una sola vez</b>. Una consulta por WhatsApp o un carrito armado no descuentan nada hasta que las registres.
      </p>
      <nav aria-label="Ventas y stock" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/ventas" aria-current="page" className="rounded-full border border-emerald bg-emerald px-4 py-1.5 text-paper">Registrar y ver ventas</Link>
        <Link href="/admin/ventas/movimientos" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Movimientos de stock</Link>
        <Link href="#gastos" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Gastos</Link>
      </nav>
      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
        <form action="/admin/ventas" className="flex flex-wrap items-end gap-3" aria-label="Filtrar contabilidad por mes">
          <label className="grid gap-1 text-sm font-semibold">Mes
            <select name="mes" key={months.includes(String(selectedMonth)) ? String(selectedMonth) : currentMonth} defaultValue={months.includes(String(selectedMonth)) ? String(selectedMonth) : currentMonth} className="min-h-11 rounded-md border border-ink/40 bg-white px-3">
              {months.map((month) => <option key={month} value={month}>{monthLabel.format(new Date(`${month}-01T00:00:00Z`))}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper">Ver mes</button>
        </form>
        <form action="/admin/ventas" key={`${period.from ?? ""}/${period.to ?? ""}`} className="flex flex-wrap items-end gap-3" aria-label="Filtrar contabilidad por fecha">
          <label className="grid gap-1 text-sm font-semibold">Desde
            <input type="date" name="desde" defaultValue={period.from ?? ""} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Hasta
            <input type="date" name="hasta" defaultValue={period.to ?? ""} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper">Ver período</button>
        </form>
        {(filtered || error) && <Link href="/admin/ventas?mes=todo" className="inline-flex min-h-11 items-center px-2 text-sm underline">Ver todo</Link>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-vermilion">{error} Se muestra el historial completo.</p>}
      <h2 className="mt-6 text-lg font-semibold">{filtered ? "Resumen del período" : "Resumen histórico"}</h2>
      <section className="mt-3 rounded-lg border border-ink/15 bg-white p-4">
        <AdminAccountingSummary report={report} />
        <p className="mt-3 text-sm">Gastos registrados: <b>{formatARS(overview.spent)}</b> · <Link href={`/admin/costos?${reportQuery}`} className="font-semibold underline">Ver ganancia y comisiones del período</Link></p>
      </section>
      {overview.pending > 0 && <p className="mt-2 text-sm text-ink/75">{overview.pending} ventas con tarjeta tienen el importe recibido pendiente.</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AccountingChart title="Facturación por día" rows={[...billing].sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, total }))} money from={period.from} to={period.to} empty="No hay facturación en estas fechas." />
        <AccountingChart title="Visitas por día" rows={overview.visits} from={period.from} to={period.to} empty="Todavía no hay visitas medidas en estas fechas." />
      </div>
      <p className="mt-2 text-xs text-ink/70">Visitas estimadas: se cuenta una vez por navegador por día, desde que se habilita la medición.</p>
      <details className="mt-6 rounded-lg border border-ink/15 bg-white p-4">
        <summary className="cursor-pointer font-semibold">Costo por producto</summary>
        <p className="mt-2 text-sm text-ink/70">Se muestra el promedio de compras confirmadas, el costo de referencia cargado en el panel o la estimación de proveedor y logística, en ese orden.</p>
        <ul className="mt-3 max-h-80 divide-y divide-ink/10 overflow-y-auto text-sm">
          {products.map((product) => {
            const cost = costs.get(product.id);
            const manual = manualCosts.get(product.id)?.cost;
            const estimate = proposal.find((row) => row.id === product.id);
            const reference = estimate?.providerRmb != null && estimate.logisticsUsd != null ? (estimate.providerRmb / 6.6611 + estimate.logisticsUsd) : null;
            const manualLabel = manual && (manual.currency === "USD" ? formatUSD(manual.amountMinor) : formatARS(manual.amountMinor));
            return <li key={product.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2"><span>{product.title}</span><b>{cost != null ? formatARS(cost) : manualLabel ? `${manualLabel} · Referencia` : reference != null ? `USD ${reference.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} estimados` : "Costo pendiente"}</b></li>;
          })}
        </ul>
        <Link href="/admin/costos-productos" className="mt-3 inline-block text-sm font-semibold underline">Editar costos por producto</Link>
      </details>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-start">
        <section aria-labelledby="registrar-title" className="min-w-0">
          <h2 id="registrar-title" className="text-lg font-semibold">Registrar una venta externa</h2>
          <div className="mt-3"><AdminSaleForm products={products} /></div>
        </section>
        <section aria-labelledby="ultimas-title" className="min-w-0">
          <h2 id="ultimas-title" className="text-lg font-semibold">{filtered ? "Ventas del período" : "Últimas ventas"}</h2>
          <p className="mt-1 text-xs text-ink/65">Las ventas no se editan ni se borran. Si te equivocaste, anulala: devuelve el stock y queda constancia.</p>
          <div className="mt-3">{filtered && sales.length === 0 ? <p className="text-sm text-ink/70">No hay ventas en este período.</p> : <AdminSalesList sales={sales} />}</div>
        </section>
      </div>
      <section id="gastos" className="mt-10 grid gap-8 border-t border-ink/20 pt-6 lg:grid-cols-[1.1fr_1fr]" aria-labelledby="gastos-title">
        <div>
          <h2 id="gastos-title" className="mb-3 text-lg font-semibold">Registrar un gasto</h2>
          <AdminForm endpoint="/api/admin/contabilidad/gastos" submit="Guardar gasto" ok="Gasto registrado." fields={[
            { name: "spentAt", label: "Fecha del gasto", type: "date", required: true },
            { name: "amountMinor", label: "Importe del gasto ($)", type: "pesos", required: true },
            { name: "description", label: "Concepto", type: "text", maxLength: 300, required: true },
            { name: "paymentMethod", label: "Medio de pago del gasto", type: "select", required: true, options: [
              { value: "efectivo", label: "Efectivo" }, { value: "transferencia", label: "Transferencia" },
              { value: "tarjeta", label: "Tarjeta" }, { value: "otro", label: "Otro" },
            ] },
          ]} />
        </div>
        <div>
          <h3 className="mb-3 text-lg font-semibold">{filtered ? "Gastos del período" : "Últimos gastos"}</h3>
          {overview.expenses.length === 0 ? <p className="text-sm text-ink/70">{filtered ? "No hay gastos en este período." : "Todavía no registraste gastos."}</p> : (
            <ul className="space-y-2">
              {overview.expenses.map((expense) => (
                <li key={expense.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-ink/15 bg-white p-3 text-sm">
                  <div className="min-w-0"><p className="break-words font-semibold">{expense.description}</p><p className="text-ink/70">{new Date(expense.spentAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} · {expense.paymentMethod}</p></div>
                  <b>{formatARS(expense.amountMinor)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
