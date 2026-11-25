import Link from "next/link";
import { AccountingChart } from "@/components/accounting-chart";
import { AdminAccountingSummary } from "@/components/admin-accounting-summary";
import { AdminReceivables } from "@/components/admin-receivables";
import { averageCosts, profitReport } from "@/features/costos/service";
import { listProductCosts } from "@/features/costos/product-costs";
import { formatUSD } from "@/features/fx/convert";
import proposal from "@/content/real/propuesta-mayorista.json";
import { AdminExpenses } from "@/components/admin-expenses";
import { currentAccountingMonth, parseAccountingPeriod, type AccountingChannel } from "@/features/contabilidad/period";
import { accountingOverview, reservedSalesToCollect, wholesaleReceipts } from "@/features/contabilidad/service";
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

const channels: { value: AccountingChannel; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "minorista", label: "Minorista" },
  { value: "mayorista", label: "Mayorista" },
];

export default async function Ventas({ searchParams }: { searchParams: Promise<{ mes?: string | string[]; desde?: string | string[]; hasta?: string | string[]; canal?: string | string[] }> }) {
  await requireAdmin("/admin/ventas");
  const db = getDb();
  const { mes, desde, hasta, canal } = await searchParams;
  const channel = channels.find(({ value }) => value === canal)?.value ?? "todos";
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
  const [fx, low, sales, overview, costs, report, manualCosts, scheduled, reserved, wholesaleCash] = await Promise.all([
    currentRate(db), getLowStock(db), listSales(db, 30, period), accountingOverview(db, period), averageCosts(db, ids),
    profitReport(db, period, channel), listProductCosts(db, ids), listSales(db, 500, undefined, true),
    channel === "mayorista" ? null : reservedSalesToCollect(db),
    channel === "minorista" ? null : wholesaleReceipts(db, period),
  ]);
  const billing = new Map<string, number>();
  for (const row of report.rows) billing.set(row.day, (billing.get(row.day) ?? 0) + row.revenueMinor);
  const reportQuery = new URLSearchParams({ ...(period.from ? { desde: period.from } : {}), ...(period.to ? { hasta: period.to } : {}), ...(!filtered ? { todo: "1" } : {}) });
  const periodQuery = !filtered ? new URLSearchParams({ mes: "todo" })
    : typeof selectedMonth === "string" ? new URLSearchParams({ mes: selectedMonth }) : reportQuery;
  const channelQuery = channel === "todos" ? "" : `&canal=${channel}`;
  const products: SaleProduct[] = (await adminProducts(db, catalog.products, fx))
    .filter((a) => !catalog.products.find((x) => x.id === a.product.id)?.retired)
    .map((a) => ({ id: a.product.id, sku: a.product.sku, title: a.product.title, language: a.product.language, stock: a.product.stockQuantity, priceMinor: a.product.priceMinor, low: isLowStock(a.product.stockQuantity, Boolean(a.product.orderOnly), low.threshold), orderOnly: Boolean(a.product.orderOnly), packSize: a.product.packSize ?? null }));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Contabilidad</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">
        Registrá ventas externas o agendá una entrega para retirar las unidades del stock disponible. Las entregas agendadas pasan a facturación cuando confirmás el cobro.
      </p>
      <nav aria-label="Ventas y stock" className="mt-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/ventas" aria-current="page" className="rounded-full border border-emerald bg-emerald px-4 py-1.5 text-paper">Registrar y ver ventas</Link>
        <Link href="/admin/ventas/movimientos" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Movimientos de stock</Link>
        <Link href="#por-cobrar" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Por cobrar</Link>
        <Link href="#entregas" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Entregas agendadas{scheduled.length > 0 && ` (${scheduled.length})`}</Link>
        <Link href="#gastos" className="rounded-full border border-ink/30 bg-white px-4 py-1.5 hover:border-emerald">Gastos</Link>
      </nav>
      <div className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-4">
        <form action="/admin/ventas" className="flex flex-wrap items-end gap-3" aria-label="Filtrar contabilidad por mes">
          {channel !== "todos" && <input type="hidden" name="canal" value={channel} />}
          <label className="grid gap-1 text-sm font-semibold">Mes
            <select name="mes" key={months.includes(String(selectedMonth)) ? String(selectedMonth) : currentMonth} defaultValue={months.includes(String(selectedMonth)) ? String(selectedMonth) : currentMonth} className="min-h-11 rounded-md border border-ink/40 bg-white px-3">
              {months.map((month) => <option key={month} value={month}>{monthLabel.format(new Date(`${month}-01T00:00:00Z`))}</option>)}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper">Ver mes</button>
        </form>
        <form action="/admin/ventas" key={`${period.from ?? ""}/${period.to ?? ""}`} className="flex flex-wrap items-end gap-3" aria-label="Filtrar contabilidad por fecha">
          {channel !== "todos" && <input type="hidden" name="canal" value={channel} />}
          <label className="grid gap-1 text-sm font-semibold">Desde
            <input type="date" name="desde" defaultValue={period.from ?? ""} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Hasta
            <input type="date" name="hasta" defaultValue={period.to ?? ""} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" />
          </label>
          <button type="submit" className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper">Ver período</button>
        </form>
        {(filtered || error) && <Link href={`/admin/ventas?mes=todo${channelQuery}`} className="inline-flex min-h-11 items-center px-2 text-sm underline">Ver todo</Link>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-vermilion">{error} Se muestra el historial completo.</p>}
      <h2 className="mt-6 text-lg font-semibold">{filtered ? "Resumen del período" : "Resumen histórico"}</h2>
      <nav aria-label="Canal de facturación" className="mt-2 flex flex-wrap gap-2">
        {channels.map(({ value, label }) => {
          const query = new URLSearchParams(periodQuery);
          if (value !== "todos") query.set("canal", value);
          return <Link key={value} href={`/admin/ventas?${query}`} prefetch={false} aria-current={channel === value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold ${channel === value ? "border-emerald bg-emerald text-paper" : "border-ink/30 bg-white hover:border-emerald"}`}>{label}</Link>;
        })}
      </nav>
      <section className="mt-3 rounded-lg border border-ink/15 bg-white p-4">
        <AdminAccountingSummary report={report} outstandingLabel="Por cobrar de lo facturado" />
        <p className="mt-3 text-xs text-ink/75">Los pedidos mayoristas se suman al guardar el total acordado. La seña y el saldo se muestran en «Cobrado» cuando confirmás los pagos.</p>
        <p className="mt-2 text-sm">Gastos generales pagados: <b>{formatARS(overview.spent)}</b> · <Link href="#por-pagar" className="font-semibold underline">Por pagar {formatARS(overview.pendingSpent)}</Link> · <Link href={`/admin/costos?${reportQuery}`} className="font-semibold underline">Ver ganancia y comisiones de todos los canales</Link></p>
      </section>
      {overview.pending > 0 && <p className="mt-2 text-sm text-ink/75">{overview.pending} ventas con tarjeta tienen el importe recibido pendiente.</p>}
      <AdminReceivables report={report} reservations={reserved} filtered={filtered} />
      {wholesaleCash && <section className="mt-6 rounded-lg border border-ink/15 bg-white p-4" aria-labelledby="cobros-mayoristas">
        <h2 id="cobros-mayoristas" className="font-semibold">Ingresos mayoristas por fecha de cobro</h2>
        <p className="mt-2 text-xl font-bold" data-testid="mayorista-ingresos-periodo">{formatARS(wholesaleCash.totalMinor)}</p>
        <p className="mt-1 text-xs text-ink/75">Incluye señas y saldos confirmados en estas fechas, aunque el pedido sea anterior. Son ingresos brutos; los excedentes quedan a revisar. No se suman otra vez a lo vendido.</p>
        {wholesaleCash.rows.length === 0 ? <p className="mt-3 text-sm text-ink/75">Sin ingresos mayoristas en estas fechas.</p> : <ul className="mt-3 divide-y divide-ink/10">
          {wholesaleCash.rows.map((payment) => <li key={payment.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span><Link href={`/admin/pedidos/${payment.reference}`} className="font-semibold underline">{payment.reference}</Link> · {payment.kind === "sena" ? "Seña" : payment.kind === "saldo" ? "Saldo" : "Pago"} · {new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(payment.paidAt)}</span>
            <b>{formatARS(payment.amountMinor)}</b>
          </li>)}
        </ul>}
      </section>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AccountingChart title="Facturación por día" rows={[...billing].sort(([a], [b]) => a.localeCompare(b)).map(([day, total]) => ({ day, total }))} money from={period.from} to={period.to} empty="No hay facturación en estas fechas." />
        <AccountingChart title="Visitas por día" rows={overview.visits} from={period.from} to={period.to} empty="Todavía no hay visitas medidas en estas fechas." />
      </div>
      <p className="mt-2 text-xs text-ink/70">Visitas estimadas: se cuenta una vez por navegador por día, desde que se habilita la medición.</p>
      {channel === "mayorista" && (
        <section className="mt-6 rounded-lg border border-ink/15 bg-white p-4" aria-labelledby="facturacion-mayorista">
          <h2 id="facturacion-mayorista" className="font-semibold">Pedidos mayoristas del período</h2>
          {report.rows.length === 0 ? <p className="mt-2 text-sm text-ink/75">No hay pedidos mayoristas con importe acordado en estas fechas.</p> : (
            <ul className="mt-2 divide-y divide-ink/10">
              {report.rows.map((row) => (
                <li key={row.ref} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <div className="min-w-0 break-words">
                    <Link href={row.wholesale ? `/admin/pedidos/${row.wholesale.reference}` : `/admin/ventas/${row.ref}`} className="font-semibold underline">
                      {row.wholesale?.reference ?? row.ref}
                    </Link>
                    <p className="text-ink/75">{row.label} · {row.day.split("-").reverse().join("/")}</p>
                  </div>
                  <p className="text-ink/75"><b className="text-ink">{formatARS(row.revenueMinor)}</b> · Cobrado {formatARS(row.collectedMinor ?? 0)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
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
          <div className="mt-3"><AdminSaleForm products={products} defaultRate10k={fx.rate10k} /></div>
        </section>
        <section aria-labelledby="ultimas-title" className="min-w-0">
          <h2 id="ultimas-title" className="text-lg font-semibold">{filtered ? "Ventas del período" : "Últimas ventas"}</h2>
          <p className="mt-1 text-xs text-ink/65">Las ventas no se editan ni se borran. Si te equivocaste, anulala: devuelve el stock y queda constancia.</p>
          <div className="mt-3">{filtered && sales.length === 0 ? <p className="text-sm text-ink/70">No hay ventas en este período.</p> : <AdminSalesList sales={sales} />}</div>
        </section>
      </div>
      <section id="entregas" className="mt-10 border-t border-ink/20 pt-6" aria-labelledby="entregas-title">
        <h2 id="entregas-title" className="mb-3 text-lg font-semibold">Entregas agendadas</h2>
        {scheduled.length ? <AdminSalesList sales={scheduled} /> : <p className="text-sm text-ink/70">No hay entregas pendientes.</p>}
      </section>
      <AdminExpenses expenses={overview.expenses} pendingExpenses={overview.pendingExpenses} pendingSpent={overview.pendingSpent} filtered={filtered} />
    </div>
  );
}
