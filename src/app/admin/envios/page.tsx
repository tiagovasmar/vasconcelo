import Link from "next/link";
import { AdminButton, AdminForm } from "@/components/admin-form";
import { ShipmentPurchasesForm } from "@/components/shipment-purchases-form";
import { shippablePurchases } from "@/features/importaciones/service";
import { getDb } from "@/db/client";
import { when } from "@/features/consultas/ui";
import { expenseShares, itemBaseCostMinor, listPurchases } from "@/features/costos/service";
import { listAllProducts } from "@/features/catalog/data";
import { formatUSD } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import { listShipments, shippableLines, shipmentPurchaseContents } from "@/features/pedidos/envios";
import { SHIPMENT_LABEL, SHIPMENT_STATUSES, shipmentRank, type ShipmentStatus } from "@/features/pedidos/etapas";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const dateOf = (s: Awaited<ReturnType<typeof listShipments>>[number], st: ShipmentStatus) => ({ preparando: s.createdAt, enviado_proveedor: s.sentAt, recibido_origen: s.originReceivedAt, en_transito: s.transitAt, recibido_argentina: s.arrivedAt })[st];
const dateInput = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
const detailBox = "mt-3 rounded-lg border border-ink/15 p-3 text-sm";
const amount = (minor: number | null) => minor === null ? "" : String(minor / 100).replace(".", ",");

/** Envíos internacionales agrupados: llevan artículos de varios encargos o pedidos mayoristas. Avanzarlos refleja el viaje SOLO en los artículos (y cantidades) que viajaron en cada uno. */
export default async function AdminEnvios() {
  await requireAdmin("/admin/envios");
  const db = getDb();
  const [shipments, lines, purchases, records, contents, products] = await Promise.all([
    listShipments(db), shippableLines(db), shippablePurchases(db), listPurchases(db), shipmentPurchaseContents(db), listAllProducts(undefined, db),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const costsByItem = new Map(records.flatMap((purchase) => {
    const base = purchase.items.map((item) => itemBaseCostMinor(purchase, item.unitPriceOriginalMinor, item.quantity));
    const expenses = purchase.expenses.map((expense) => expenseShares(purchase.items, base, expense));
    return purchase.items.map((item, index) => [item.id, {
      item, subtotal: base[index], expenses: purchase.expenses.map((expense, i) => ({ ...expense, share: expenses[i][index] })),
    }] as const);
  }));
  const EP = "/api/admin/envios";
  const rowsByShipment = Map.groupBy(contents, (row) => row.shipmentId);
  const pendingReception = (id: string) => (rowsByShipment.get(id) ?? []).some((row) => row.accepted + row.missing + row.damaged < row.quantity);
  const history = shipments.filter((s) => s.status === "recibido_argentina" && !pendingReception(s.id));
  const historyIds = new Set(history.map((s) => s.id));
  const active = shipments.filter((s) => !historyIds.has(s.id));

  function shipmentCard(s: (typeof shipments)[number]) {
    const prep = s.status === "preparando";
    const hasItems = s.items.length > 0 || s.importedUnits > 0;
    const rows = rowsByShipment.get(s.id) ?? [];
    const rowsByPurchase = Map.groupBy(rows, (row) => row.purchaseId);
    const totals = { purchase: 0, freight: 0, customs: 0, sales: 0, unpriced: 0, units: 0 };
    for (const row of rows) {
      const detail = costsByItem.get(row.itemId);
      if (!detail) continue;
      const prorate = (minor: number) => minor * row.quantity / detail.item.quantity;
      totals.purchase += prorate(detail.subtotal);
      for (const expense of detail.expenses) {
        if (expense.kind === "envio") totals.freight += prorate(expense.share);
        else if (expense.kind === "impuestos") totals.customs += prorate(expense.share);
        else totals.purchase += prorate(expense.share);
      }
      if (row.destination !== "reventa") continue;
      const units = row.quantity - row.damaged - row.missing;
      const price = productById.get(detail.item.productId)?.priceMinor;
      totals.units += units;
      if (price != null && price > 0) totals.sales += price * units;
      else totals.unpriced += units;
    }
    const freight = s.freightMinor ?? Math.round(totals.freight);
    const customs = s.customsMinor ?? Math.round(totals.customs);
    const totalCost = Math.round(totals.purchase) + freight + customs;
    const estimated = Math.round(totals.sales * 0.9);
    const estimateAvailable = totals.units > totals.unpriced;
    const costsPending = (s.freightMinor === null && freight === 0) || (s.customsMinor === null && customs === 0);
    const intermediateOptions = (["enviado_proveedor", "recibido_origen"] as const)
      .filter((x) => shipmentRank(x) > shipmentRank(s.status)).map((x) => ({ value: x, label: SHIPMENT_LABEL[x] }));
    const arrived = s.status === "recibido_argentina";
    const nextStatus = s.status === "en_transito" ? "recibido_argentina" : "en_transito";
    const leaving = nextStatus === "en_transito";
    return (
      <section key={s.id} id={s.id} className={card} data-testid="envio">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{s.label}</h3>
          <span className="rounded-full bg-gold/30 px-3 py-1 text-sm font-semibold ring-1 ring-gold" data-testid="envio-estado">{SHIPMENT_LABEL[s.status as ShipmentStatus]}</span>
        </div>

        <p className="mt-1 text-sm text-ink/75">
          {s.purchases.length > 0 && <>{s.purchases.length} {s.purchases.length === 1 ? "compra" : "compras"} · </>}
          {s.importedUnits + s.items.reduce((qty, item) => qty + item.quantity, 0)} unidades
          {s.trackingNumber && <> · Seguimiento {s.trackingNumber}</>}
        </p>
        {arrived && pendingReception(s.id) && <div className="mt-4 rounded-lg bg-emerald/10 p-3">
          <AdminButton endpoint={EP} body={{ action: "receive_all", shipmentId: s.id }}
            label="Confirmar que llegó lo pendiente en buen estado"
            ok="Recepción guardada."
            confirmText="¿Confirmás que todas las unidades pendientes llegaron en buen estado? Si hubo faltantes, registralos en la compra primero." />
        </div>}

        {!arrived && hasItems && <details key={nextStatus} className="mt-4 rounded-lg bg-emerald/10 p-3">
          <summary className="cursor-pointer font-semibold">{leaving ? "Registrar salida a Argentina" : "Registrar llegada a Argentina"}</summary>
          <div className="mt-3">
            <AdminForm endpoint={EP} compact fixed={{ action: "status", shipmentId: s.id, status: nextStatus }}
              fields={[
                { name: "occurredAt", label: leaving ? "Fecha de salida" : "Fecha de llegada", type: "date", required: true },
                { name: "publicNote", label: "Nota para el cliente (opcional)", optional: true },
              ]}
              submit="Guardar fecha" ok="Envío actualizado." testId="form-envio-estado" />
          </div>
        </details>}
        <details className={detailBox} open={!hasItems ? true : undefined}>
          <summary className="cursor-pointer font-semibold">Compras y productos</summary>
          <ul className="mt-3 divide-y divide-ink/10 text-sm" aria-label="Artículos del envío">
            {s.items.map((it) => (
              <li key={it.lineId} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid="envio-item">
                <span>{it.quantity} × {it.title} <Link href={`/admin/pedidos/${it.inquiryId}`} className="font-mono text-xs underline">{it.inquiryId}</Link></span>
                {prep && <AdminButton endpoint={EP} body={{ action: "remove_item", shipmentId: s.id, lineId: it.lineId }} label="Quitar" ok="Quitado." />}
              </li>
            ))}
            {s.purchases.map((p) => <li key={p.purchaseId} className="py-1.5">
              <Link href={`/admin/compras/${p.purchaseId}`} className="font-semibold underline">{p.supplier}{p.reference && ` · ${p.reference}`}</Link> · {dateInput.format(p.date)} · {p.quantity} u. · {p.purchaseId}
              <ul className="mt-1 space-y-1">
                {(rowsByPurchase.get(p.purchaseId) ?? []).map((row) => {
                  const productId = costsByItem.get(row.itemId)?.item.productId ?? "Producto";
                  const title = productById.get(productId)?.title ?? productId;
                  return <li key={row.allocationId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-paper-2 px-3 py-1">
                    <span>{row.quantity} × {title}</span>
                    {prep && <AdminButton endpoint="/api/admin/compras" body={{ action: "parcel", shipmentId: s.id, allocationId: row.allocationId, quantity: 0 }}
                      label={`Quitar ${title}`} confirmText={`¿Quitar ${row.quantity} unidades de este despacho? Quedarán disponibles en su compra.`} />}
                  </li>;
                })}
              </ul>
            </li>)}
            {s.items.length === 0 && !s.importedUnits && <li className="py-1.5 text-ink/75">Sin artículos todavía.</li>}
          </ul>
          {prep && purchases.length > 0 && <ShipmentPurchasesForm shipmentId={s.id} purchases={purchases} />}
          {prep && lines.length > 0 && (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <h3 className="text-sm font-semibold">Sumar un producto de un pedido</h3>
              <AdminForm endpoint={EP} compact idempotent={false} fixed={{ action: "item", shipmentId: s.id }} fields={[
                { name: "lineId", label: "Artículo", type: "select", required: true, options: lines.map((l) => ({ value: String(l.lineId), label: `${l.title} · ${l.inquiryId} · sin enviar: ${l.notShipped}` })) },
                { name: "quantity", label: "Cantidad en este envío", type: "int", required: true },
              ]} submit="Sumar al envío" ok="Artículo sumado." />
            </div>
          )}
        </details>
        <details className={detailBox}>
          <summary className="cursor-pointer font-semibold">Costos, aduana y retorno</summary>
          <div className="mt-3 space-y-3">
            {rows.length > 0 && <><dl className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                ["Compras y comisiones", formatARS(Math.round(totals.purchase))],
                ["Envío", s.freightUsdMinor !== null ? `${formatUSD(s.freightUsdMinor)} · ${formatARS(freight)}` : s.freightMinor !== null || freight > 0 ? formatARS(freight) : "Pendiente"],
                ["Aduana", s.customsMinor !== null || customs > 0 ? formatARS(customs) : "Pendiente"],
                [costsPending ? "Costo conocido" : "Costo total", formatARS(totalCost)],
                [totals.unpriced ? "Ventas parciales estimadas (−10%)" : "Ventas estimadas (−10%)", estimateAvailable ? formatARS(estimated) : "Pendiente"],
                ["Ganancia estimada", estimateAvailable && !totals.unpriced && !costsPending ? formatARS(estimated - totalCost) : "Pendiente"],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}
            </dl>
            <p className="text-xs text-ink/75">Proyección para {totals.units} unidades de reventa a precio minorista vigente. {totals.unpriced > 0 && `${totals.unpriced} unidades sin precio en pesos.`}</p></>}
            <div className="border-t border-ink/10 pt-3">
              <AdminForm key={`${s.freightUsdMinor}/${s.freightRate10k}/${s.customsMinor}`} endpoint={EP} fixed={{ action: "costs", shipmentId: s.id, keepLegacyFreight: s.freightUsdMinor === null && s.freightMinor !== null }} fields={[
                { name: "freightUsdMinor", label: "Costo de envío (USD)", type: "usd", defaultValue: amount(s.freightUsdMinor), help: s.freightUsdMinor === null && s.freightMinor !== null ? `Envío anterior guardado en pesos: ${formatARS(s.freightMinor)}.` : undefined },
                { name: "freightRateText", label: "Cotización del envío (ARS por USD)", defaultValue: s.freightRate10k === null ? "" : String(s.freightRate10k / 10_000), help: "Si la dejás vacía se usa la cotización vigente de la tienda." },
                { name: "customsMinor", label: "Costo de aduana (ARS)", type: "pesos", defaultValue: amount(s.customsMinor) },
              ]} submit="Guardar costos del despacho" />
            </div>

          <div className="border-t border-ink/10 pt-3">
            <AdminForm key={s.customsPaidAt ?? "sin-pago"} endpoint={EP} fixed={{ action: "customs_payment", shipmentId: s.id }} fields={[
              { name: "customsPaidAt", label: "Fecha de pago de impuestos de aduana", type: "date", defaultValue: s.customsPaidAt ? dateInput.format(s.customsPaidAt) : "", help: "Dejá la fecha vacía para quitarla. El importe se carga en los costos de la compra." },
            ]} submit="Guardar fecha de pago" ok="Fecha de pago guardada." />
          </div>
          </div>
        </details>
        <details className={detailBox}>
          <summary className="cursor-pointer font-semibold">Seguimiento y fechas</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-ink/75">{s.id}{s.supplier && <> · Proveedor {s.supplier}</>}</p>
            <ul className="space-y-1 text-sm">
              {SHIPMENT_STATUSES.map((status) => {
                const date = dateOf(s, status);
                return date && <li key={status}>{SHIPMENT_LABEL[status]} · {when(date)}</li>;
              })}
            </ul>
            {s.importedUnits > 0 && <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-semibold">Disponible para comprar {s.availableAt ? `desde el ${dateInput.format(s.availableAt)}` : "al confirmar la recepción"}</summary>
              <AdminForm key={s.availableAt ?? "sin-fecha"} endpoint={EP} fixed={{ action: "availability", shipmentId: s.id }} fields={[
                { name: "availableAt", label: "Disponible para comprar desde", type: "date", defaultValue: s.availableAt ? dateInput.format(s.availableAt) : "", help: "Se habilitan las unidades para reventa revisadas en buen estado. Sin fecha, se habilitan al confirmar la recepción." },
              ]} submit="Guardar disponibilidad" />
            </details>}
            <div className="border-t border-ink/10 pt-3">
              {(s.carrier || s.trackingNumber) && <p className="my-2 break-words">{s.carrier} {s.trackingNumber}</p>}
              <AdminForm endpoint={EP} fixed={{ action: "metadata", shipmentId: s.id }} fields={[
                { name: "carrier", label: "Transportista", defaultValue: s.carrier ?? "", maxLength: 80 },
                { name: "trackingNumber", label: "Número de seguimiento", defaultValue: s.trackingNumber ?? "", maxLength: 100 },
                { name: "internalNote", label: "Nota interna", type: "textarea", defaultValue: s.internalNote ?? "", maxLength: 500 },
              ]} submit="Guardar datos del envío" />
            </div>

            {hasItems && intermediateOptions.length > 0 && <div className="border-t border-ink/10 pt-3">
              <AdminForm endpoint={EP} fixed={{ action: "status", shipmentId: s.id }} fields={[
                { name: "status", label: "Etapa en China", type: "select", required: true, options: intermediateOptions },
                { name: "occurredAt", label: "Fecha real", type: "date", required: true },
                { name: "publicNote", label: "Nota para el cliente (opcional)", optional: true },
              ]} submit="Guardar etapa" ok="Envío actualizado." />
            </div>}
          </div>
        </details>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Despachos</h1>
      <Link href="/admin/compras" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">Ir a Compras</Link>

      <section className={card} aria-label="Crear un despacho">
        {purchases.length > 0 ? <ShipmentPurchasesForm purchases={purchases} /> : <p className="text-sm text-ink/75">No hay compras pendientes de despachar.</p>}
      </section>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold">Crear envío para pedidos de clientes</summary>
        <AdminForm endpoint={EP} fixed={{ action: "create" }} fields={[
          { name: "label", label: "Nombre del envío", required: true, placeholder: "Ej.: Lote noviembre" },
          { name: "supplier", label: "Proveedor (opcional)", optional: true },
          { name: "carrier", label: "Transportista", optional: true },
          { name: "trackingNumber", label: "Número de seguimiento", optional: true },
          { name: "internalNote", label: "Nota interna (opcional)", optional: true },
        ]} submit="Crear envío" ok="Envío creado." testId="form-envio-nuevo" />
      </details>

      <section className="mt-6" aria-labelledby="despachos-activos">
        <h2 id="despachos-activos" className="text-lg font-semibold">Despachos activos</h2>
        {active.length ? active.map(shipmentCard) : <p className="mt-2 text-sm text-ink/75">No hay despachos activos.</p>}
      </section>
      {history.length > 0 && <details className={card}>
        <summary className="cursor-pointer font-semibold">Historial de despachos ({history.length})</summary>
        {history.map(shipmentCard)}
      </details>}
    </div>
  );
}
