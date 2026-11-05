import { preorderHours } from "@/features/importaciones/hold-state";
import { senaFor } from "@/features/pedidos/etapas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminButton, AdminForm, type FormField } from "@/components/admin-form";
import { ImportDocumentForm } from "@/components/import-document-form";
import { PurchaseForm } from "@/components/purchase-form";
import { getDb } from "@/db/client";
import { expenseShares, itemBaseCostMinor, listPurchases } from "@/features/costos/service";
import { linkableLines, purchaseRelations } from "@/features/importaciones/service";
import { listShipments } from "@/features/pedidos/envios";
import { SHIPMENT_LABEL, type ShipmentStatus } from "@/features/pedidos/etapas";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { purchaseProducts } from "../products";

const EP = "/api/admin/compras";
const section = "space-y-3 rounded-xl border border-ink/20 bg-white p-4 sm:p-5";
const tile = "min-w-0 space-y-3 rounded-lg border border-ink/15 bg-paper-2 p-3";
const date = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(ms);
const money = (minor: number | null) => minor === null ? "Pendiente" : formatARS(minor);
const amount = (minor: number | null) => minor === null ? "" : String(minor / 100).replace(".", ",");
const names = { reventa: "Reventa libre", encargo: "Encargo", vendido: "Ya vendido", personal: "Uso personal" };
const expenseName = (kind: string) => ({ envio: "Envío", impuestos: "Aduana", otros: "Otros" })[kind] ?? kind;
const allocationName = (kind: string) => ({ unidades: "Por unidades", valor: "Por valor", manual: "Manual" })[kind] ?? kind;
const options = (values: Record<string, string>) => Object.entries(values).map(([value, label]) => ({ value, label }));

export default async function PurchaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/compras/${id}`);
  const db = getDb();
  const [p] = await listPurchases(db, id);
  if (!p) notFound();
  const products = purchaseProducts();
  const title = (id: string) => products.find((p) => p.value === id)?.label ?? id;
  const [{ allocations, parcels, documents, payments, availablePayments, holds, history }, lines, shipments] = await Promise.all([
    purchaseRelations(db, p.id, p.items.map((i) => i.id)),
    linkableLines(db, p.items.map((i) => i.productId)),
    listShipments(db),
  ]);
  const holdHours = preorderHours();
  const draft = p.status === "borrador";
  const base = p.items.map((i) => itemBaseCostMinor(p, i.unitPriceOriginalMinor, i.quantity));
  const merchandise = base.reduce((n, x) => n + x, 0);
  const shares = p.expenses.map((e) => e.shares.length ? p.items.map((i) => e.shares.find((s) => s.itemId === i.id)?.shareMinor ?? 0) : expenseShares(p.items, base, e));
  const total = merchandise + p.expenses.reduce((n, e) => n + (e.amountMinor ?? 0), 0);
  const totalUnits = p.items.reduce((n, i) => n + i.quantity, 0);
  const units = (destination?: string) => allocations.filter((a) => !destination || a.destination === destination).reduce((n, a) => n + a.quantity, 0);
  const accepted = parcels.reduce((n, { parcel }) => n + parcel.accepted, 0);
  const reconciled = parcels.reduce((n, { parcel }) => n + parcel.accepted + parcel.missing + parcel.damaged, 0);
  const preparing = shipments.filter((s) => s.status === "preparando");
  const paid = payments.reduce((n, { expense }) => n + expense.amountMinor, 0);
  return (
    <div className="mx-auto max-w-[1080px] space-y-5 px-4 py-8 sm:px-8">
      <header>
        <Link href="/admin/compras" className="text-sm font-semibold underline">Volver a compras</Link>
        <h1 className="mt-2 break-words text-3xl font-semibold">{p.supplier}</h1>
        <p className="mt-1 break-words text-sm">{p.id} · {date(p.purchasedAt)}{p.reference && ` · Ref. ${p.reference}`} · {p.currency}{p.rateToArs10k && ` · ${p.rateToArs10k / 10_000} ARS por ${p.currency}`}</p>
        <p className="mt-1 text-sm text-ink/75">{reconciled === totalUnits ? `Recepción revisada y finalizada · ${date(history.reduce((n, h) => Math.max(n, h.occurredAt), 0))}` : p.orderedAt ? `Comprado al proveedor · ${date(p.orderedAt)}` : "Compra registrada"}</p>
        {p.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.note}</p>}
      </header>
      <section className={section}>
        <h2 className="text-lg font-semibold">Resumen</h2>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Mercadería", money(merchandise)],
            ...["envio", "impuestos", "otros"].map((k) => {
              const rows = p.expenses.filter((e) => e.kind === k);
              const known = rows.filter((e) => e.amountMinor !== null);
              return [expenseName(k), known.length ? money(known.reduce((n, e) => n + e.amountMinor!, 0)) + (rows.some((e) => e.certainty !== "definitivo") ? " · parcial/estimado" : "") : k === "otros" && !rows.length ? "Sin registrar" : "Pendiente"];
            }),
            [draft ? "Total conocido · provisional" : "Total definitivo", money(total)], ["Egresos vinculados", money(paid)],
            ["Reventa / comprometidas", `${units("reventa")} / ${units("encargo") + units("vendido")}`], ["Aceptadas / compradas", `${accepted} / ${totalUnits}`],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-paper-2 p-2.5">
            <dt className="text-xs text-ink/75">{label}</dt><dd className="break-words text-sm font-semibold">{value}</dd>
          </div>)}
        </dl>
        <p className="text-sm text-ink/75">{units("personal")} personales · {totalUnits - units()} sin destino · {totalUnits - reconciled} por conciliar.</p>
      </section>

      {draft && <details className={section}>
        <summary className="cursor-pointer text-lg font-semibold">{p.managedImport ? "Editar compra y gastos" : "Continuar borrador de Costos como importación"}</summary>
        <PurchaseForm managed draft={p} products={products} />
      </details>}

      <section className={section}>
        <h2 className="text-lg font-semibold">Costos y reparto</h2>
        {p.expenses.map((e, k) => <details className={tile} key={e.id}>
          <summary className="cursor-pointer text-sm font-semibold">{expenseName(e.kind)}{e.description && ` · ${e.description}`} · {money(e.amountMinor)} · {e.certainty} · {allocationName(e.allocation)}</summary>
          {e.amountMinor !== null && <ul className="space-y-1 text-sm">{p.items.map((i, j) => <li key={i.id}>{title(i.productId)} · {money(shares[k][j])}</li>)}</ul>}
        </details>)}
        {p.items.map((i, k) => <p key={i.id} className="text-sm">{title(i.productId)} · <strong>{money(i.finalUnitCostMinor ?? Math.round((base[k] + shares.reduce((n, s) => n + s[k], 0)) / i.quantity))}</strong> por unidad {draft && "(provisional)"}</p>)}
        {draft && <AdminButton endpoint={EP} body={{ action: "close", purchaseId: p.id }} label="Cerrar costos" confirmText="Los costos y repartos quedan congelados. ¿Cerrar esta compra?" />}
      </section>

      {p.managedImport && <section className={section}>
        <h2 className="text-lg font-semibold">Destinos y publicación</h2>
        <p className="text-sm text-ink/75">Asigná cada unidad. Las personales participan en el reparto de gastos y quedan fuera del costo comercial. {holdHours ? `Preventa activa: ${holdHours} h para cargar el comprobante en lotes que ya salieron.` : "La preventa queda en preparación hasta definir la vigencia de la retención y el tratamiento de transferencias tardías."}</p>
        {p.items.map((i) => {
          const own = allocations.filter((a) => a.itemId === i.id);
          const remaining = i.quantity - own.reduce((n, a) => n + a.quantity, 0);
          const orderOptions = lines.orders.filter((l) => l.productId === i.productId).map((l) => ({ value: String(l.id), label: `${l.ref} · ${l.name ?? l.fulfillment} · ${l.quantity} u.` }));
          const saleOptions = lines.sold.filter((l) => l.productId === i.productId).map((l) => ({ value: String(l.id), label: `${l.ref} · ${l.quantity} u.` }));
          const destinationFields: FormField[] = [
            { name: "destination", label: "Destino", type: "select", required: true, options: options(names) },
            { name: "quantity", label: "Unidades", type: "int", required: true },
            { name: "orderLineId", label: "Línea de pedido (encargo o ya vendido)", type: "select", options: orderOptions },
            { name: "saleLineId", label: "Línea de venta (ya vendido)", type: "select", options: saleOptions },
          ];
          return <article key={i.id} className={tile}>
            <h3 className="font-semibold">{title(i.productId)}</h3>
            <p className="text-sm">{i.quantity} compradas · {remaining} sin destino</p>
            {own.map((a) => {
              const assigned = parcels.filter(({ parcel }) => parcel.allocationId === a.id);
              const order = lines.orders.find((l) => l.id === a.orderLineId);
              const sale = lines.sold.find((l) => l.id === a.saleLineId);
              return <div key={a.id} className="space-y-2 rounded-lg bg-white p-3">
                <p className="text-sm font-semibold">{a.quantity} × {names[a.destination as keyof typeof names]} {order && <Link href={`/admin/pedidos/${order.ref}`} className="underline">{order.ref}</Link>} {sale && <Link href="/admin/ventas" className="underline">{sale.ref}</Link>}</p>
                {draft && !assigned.length && <details>
                  <summary className="cursor-pointer text-sm underline">Editar destino</summary>
                  <AdminForm endpoint={EP} fixed={{ action: "destination", itemId: i.id, id: a.id }} fields={destinationFields.map((f) => ({ ...f, defaultValue: String(a[f.name as "destination" | "quantity" | "orderLineId" | "saleLineId"] ?? "") }))} submit="Guardar destino" />
                  <div className="mt-2"><AdminButton endpoint={EP} body={{ action: "remove_destination", allocationId: a.id }} label="Quitar destino" /></div>
                </details>}
                {a.destination === "reventa" && <details>
                  <summary className="cursor-pointer text-sm underline">Visibilidad · {a.visibility === "preventa" ? (holdHours ? "Preventa" : "Preventa en preparación") : a.visibility === "proximamente" ? "Próximamente" : "Privado"}</summary>
                  <AdminForm endpoint={EP} fixed={{ action: "publication", allocationId: a.id }} fields={[
                    { name: "visibility", label: "Publicar", type: "select", required: true, defaultValue: a.visibility, options: options({ privado: "No mostrar", proximamente: "Próximamente", preventa: holdHours ? "Preventa con precio confirmado" : "Preparar preventa (reservas deshabilitadas)" }) },
                    { name: "offerMinor", label: "Precio unitario confirmado para preventa", type: "pesos", defaultValue: amount(a.offerMinor) },
                  ]} submit="Guardar visibilidad" />
                </details>}
                {p.orderedAt && preparing.length > 0 && <details>
                  <summary className="cursor-pointer text-sm underline">Asignar a un envío · {a.quantity - assigned.reduce((n, x) => n + x.parcel.quantity, 0)} sin asignar</summary>
                  <AdminForm endpoint={EP} fixed={{ action: "parcel", allocationId: a.id }} fields={[
                    { name: "shipmentId", label: "Envío en preparación", type: "select", required: true, options: preparing.map((s) => ({ value: s.id, label: s.label })) },
                    { name: "quantity", label: "Cantidad total en este envío (0 para quitar)", type: "int", required: true },
                  ]} submit="Guardar tramo" />
                </details>}
                {assigned.map(({ parcel, shipment }) => <p key={parcel.id} className="text-xs">{shipment.label} · {parcel.quantity} u. · {SHIPMENT_LABEL[shipment.status as ShipmentStatus]}</p>)}
              </div>;
            })}
            {draft && remaining > 0 && <details>
              <summary className="cursor-pointer text-sm font-semibold">+ Asignar destino</summary>
              <AdminForm endpoint={EP} fixed={{ action: "destination", itemId: i.id }} fields={destinationFields} submit="Asignar unidades" />
            </details>}
          </article>;
        })}
      </section>}

      <section className={section}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Envíos y recepción</h2>
          <Link href="/admin/envios" className="text-sm font-semibold underline">Crear o actualizar envíos</Link>
        </div>
        {p.managedImport && <details open={!p.orderedAt || undefined}>
          <summary className="cursor-pointer text-sm font-semibold">{p.orderedAt ? "Corregir fecha de compra al proveedor" : "Marcar comprado al proveedor"}</summary>
          <AdminForm endpoint={EP} fixed={{ action: "ordered", purchaseId: p.id }} fields={[{ name: "occurredAt", label: "Fecha real de compra al proveedor", type: "date", required: true, defaultValue: date(p.orderedAt ?? p.purchasedAt) }]} submit="Guardar fecha" />
        </details>}
        {parcels.filter(({ parcel }) => parcel.quantity > 0).map(({ parcel, shipment }) => {
          const a = allocations.find((a) => a.id === parcel.allocationId)!;
          const item = p.items.find((i) => i.id === a.itemId)!;
          const pending = parcel.quantity - parcel.accepted - parcel.missing - parcel.damaged;
          return <article className={tile} key={parcel.id}>
            <h3 className="font-semibold">{shipment.label} · {title(item.productId)}</h3>
            <p className="text-sm">{names[a.destination as keyof typeof names]} · {parcel.quantity} u. · {SHIPMENT_LABEL[shipment.status as ShipmentStatus]}</p>
            <p className="break-words text-sm">{[[shipment.sentAt, "Salida"], [shipment.originReceivedAt, "Depósito de origen"], [shipment.transitAt, "Tránsito"], [shipment.arrivedAt, "Argentina"]].map(([d, label]) => d ? `${label} ${date(Number(d))}` : "").filter(Boolean).join(" · ")}</p>
            {(shipment.carrier || shipment.trackingNumber) && <p className="break-words text-sm">{shipment.carrier} {shipment.trackingNumber}</p>}
            {shipment.internalNote && <p className="break-words text-sm">{shipment.internalNote}</p>}
            <p className="text-sm">{parcel.accepted} buenas · {parcel.missing} faltantes · {parcel.damaged} dañadas · {pending} pendientes</p>
            {shipment.arrivedAt && <details>
              <summary className="cursor-pointer text-sm font-semibold">{parcel.revision ? "Registrar otra revisión o corrección" : "Revisar recepción"}</summary>
              <p className="my-1 text-xs">Cargá los totales acumulados para este tramo. La diferencia de unidades buenas de reventa genera un movimiento de stock.</p>
              <AdminForm key={parcel.revision} endpoint={EP} fixed={{ action: "receive", parcelId: parcel.id, expectedRevision: parcel.revision }} fields={[
                { name: "accepted", label: "En buen estado", type: "int", required: true, defaultValue: String(parcel.accepted) },
                { name: "missing", label: "Faltantes", type: "int", required: true, defaultValue: String(parcel.missing) },
                { name: "damaged", label: "Dañadas", type: "int", required: true, defaultValue: String(parcel.damaged) },
                { name: "occurredAt", label: "Fecha real de revisión", type: "date", required: true },
                { name: "reason", label: "Motivo o nota de revisión", required: true, maxLength: 160 },
              ]} submit="Registrar revisión" />
            </details>}
          </article>;
        })}
        {history.length > 0 && <details>
          <summary className="cursor-pointer text-sm font-semibold">Historial de recepción</summary>
          <ul className="divide-y divide-ink/10">{history.map((h) => <li className="break-words py-2 text-sm" key={h.operationKey}>
            {date(h.occurredAt)} · Tramo {h.parcelId}, revisión {h.revision} · {h.accepted} buenas, {h.damaged} dañadas, {h.missing} faltantes · {h.reason} · {h.actorEmail}
          </li>)}</ul>
        </details>}
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">Reservas de preventa</h2>
        {!holds.length && <p className="text-sm">Todavía no hay solicitudes para esta compra.</p>}
        {holds.map((h) => <div key={h.inquiryId} className={tile}>
          <p className="text-sm"><Link className="font-semibold underline" href={`/admin/pedidos/${h.inquiryId}`}>{h.inquiryId}</Link> · {h.quantity} u. · {money(h.unitPriceMinor)} por unidad</p>
          <p className="text-sm">{h.releasedAt ? "Liberada" : h.track.cancelledAt ? "Pedido cancelado" : h.state?.expired ? "Retención vencida" : h.totals.confirmedMinor >= (senaFor(h.track.agreedMinor) ?? Infinity) ? "Reserva confirmada" : h.totals.pendingReceipts ? "Unidades retenidas · comprobante en revisión" : "Solicitud recibida · unidades retenidas a la espera de comprobante"}</p>
          {!h.releasedAt && (h.state?.expired || h.track.cancelledAt) && <AdminButton endpoint={EP} body={{ action: "release", inquiryId: h.inquiryId }} label="Liberar unidades" confirmText="¿Devolver estas unidades al tramo de reventa?" />}
        </div>)}
      </section>
      <section className={section}>
        <h2 className="text-lg font-semibold">Egresos pagados</h2>
        <p className="text-sm">El costo registrado y lo efectivamente pagado se muestran por separado. Vinculá un egreso existente si ya lo cargaste en Contabilidad.</p>
        <ul className="space-y-1 text-sm">{payments.map(({ expense }) => <li key={expense.id}>{date(expense.spentAt)} · {expense.description} · {money(expense.amountMinor)}</li>)}</ul>
        {availablePayments.length > 0 && <details>
          <summary className="cursor-pointer font-semibold">Vincular egreso existente</summary>
          <AdminForm endpoint={EP} fixed={{ action: "pay", purchaseId: p.id }} fields={[
            { name: "expenseId", label: "Egreso de Contabilidad", type: "select", required: true, options: availablePayments.map((e) => ({ value: e.id, label: `${date(e.spentAt)} · ${e.description} · ${money(e.amountMinor)}` })) },
          ]} submit="Vincular egreso" />
        </details>}
        <details>
          <summary className="cursor-pointer font-semibold">Registrar nuevo egreso pagado</summary>
          <AdminForm endpoint={EP} fixed={{ action: "pay", purchaseId: p.id }} fields={[
            { name: "description", label: "Concepto", required: true },
            { name: "spentAt", label: "Fecha de pago", type: "date", required: true },
            { name: "amountMinor", label: "Importe pagado en ARS", type: "pesos", required: true },
            { name: "paymentMethod", label: "Medio", type: "select", required: true, options: options({ transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta", otro: "Otro" }) },
          ]} submit="Registrar egreso" />
        </details>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">Adjuntos privados</h2>
        <ul className="space-y-2 text-sm">{documents.map((d) => <li key={d.id} className="break-all"><a href={`/api/admin/compras/adjuntos?id=${d.id}`} className="underline" download>{d.filename}</a></li>)}</ul>
        <ImportDocumentForm purchaseId={p.id} />
      </section>
    </div>
  );
}
