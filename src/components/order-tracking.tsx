import { INCIDENT_KIND_LABEL, REFUND_STATUS_LABEL, type CustomerOrderView } from "@/features/pedidos/service";
import { SHIPMENT_LABEL, type ShipmentStatus } from "@/features/pedidos/etapas";
import { encargo, mayorista } from "@/content/politicas";
import { formatARS } from "@/lib/format";
import { ReceiptUpload } from "./receipt-upload";

const day = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));
const kindName = { stock: "Compra", encargo: "Encargo", mayorista: "Pedido mayorista" } as const;
const methodName: Record<string, string> = { transferencia: "Transferencia", efectivo: "Efectivo", otro: "Otro medio" };
const payKind: Record<string, string> = { sena: "Seña", saldo: "Saldo", pago_total: "Pago total", otro: "Pago" };
const receiptState: Record<string, string> = { pendiente_revision: "En revisión", aceptado: "Aceptado", rechazado: "No pudimos usarlo" };

/**
 * «Mi pedido»: línea de seguimiento con fechas reales, estado del pago aparte de la logística, artículos con su avance (llegó / en camino / entregado), notas públicas,
 * incidentes y reintegros. NO muestra notas internas, costos ni datos bancarios, y no es un tablero de deuda: dice qué acción corresponde cuando hace falta.
 * La consulta por WhatsApp lleva la referencia del pedido.
 */
export function OrderTracking({ view, whatsappNumber, linkToken }: { view: CustomerOrderView; whatsappNumber: string | null; linkToken?: string }) {
  const wa = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hola, consulto por mi pedido ${view.reference}.`)}` : null;
  const k = linkToken ? `?k=${encodeURIComponent(linkToken)}` : "";
  return (
    <section aria-labelledby="seguimiento-title" className="mt-8 border border-ink/25 bg-white/80 p-5" data-testid="seguimiento">
      <p className="eyebrow text-vermilion">{kindName[view.kind]} · {view.reference}</p>
      <h2 id="seguimiento-title" className="display mt-1 text-3xl normal-case sm:text-4xl">Seguimiento de tu pedido</h2>
      <p className="mt-2 text-lg font-bold" data-testid="etapa-actual">{view.cancelled ? "Pedido cancelado" : view.stageLabel}</p>
      {view.cancelled && <p className="mt-1 text-sm">Cancelar un pedido no significa que el dinero ya se haya devuelto: si abonaste algo, el estado del reintegro figura más abajo.</p>}

      <ol className="mt-5 space-y-3" aria-label="Etapas del pedido" data-testid="linea-seguimiento">
        {view.steps.map((s) => (
          <li key={s.stage} className="flex gap-3" aria-current={s.current && !view.cancelled ? "step" : undefined}>
            <span aria-hidden="true" className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[.65rem] font-black ${s.reachedAt ? "border-emerald bg-emerald text-paper" : "border-ink/30 bg-white text-transparent"}`}>✓</span>
            <span className={s.reachedAt ? "text-ink" : "text-ink/75"}>
              <span className={s.current && !view.cancelled ? "font-extrabold" : "font-semibold"}>{s.label}</span>
              <span className="block text-xs">{s.reachedAt ? day(s.reachedAt) : "Pendiente"}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <div data-testid="bloque-pago">
          <h3 className="text-base font-bold">Pago</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-4"><dt>Importe acordado</dt><dd className="font-extrabold" data-testid="importe-acordado">{view.agreedMinor === null ? "A confirmar por la tienda" : formatARS(view.agreedMinor)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Estado del pago</dt><dd className="font-semibold" data-testid="estado-pago">{view.paymentStatusLabel}</dd></div>
          </dl>
          {view.payments.length > 0 && (
            <ul className="mt-2 divide-y divide-ink/10 text-sm" aria-label="Pagos confirmados">
              {view.payments.map((p) => <li key={p.id} className="flex justify-between gap-3 py-1"><span>{payKind[p.kind] ?? "Pago"} · {methodName[p.method] ?? p.method} · {day(p.paidAt)}</span><b>{formatARS(p.amountMinor)}</b></li>)}
            </ul>
          )}
          {view.action && <p className="mt-3 border-l-4 border-gold bg-gold/15 p-3 text-sm font-semibold" data-testid="accion-pedido">{view.action}</p>}
          {view.kind !== "stock" && <p className="mt-2 text-xs text-ink/75">Condiciones: seña del {view.kind === "mayorista" ? mayorista.senaPercent : encargo.senaPercent}% del importe confirmado; el resto se paga cuando el pedido llega a Argentina, antes del despacho o del retiro. Si el paquete se pierde o un problema impide cumplir el pedido, se reintegra la seña.</p>}
        </div>

        <div data-testid="bloque-comprobantes">
          <h3 className="text-base font-bold">Comprobantes de transferencia</h3>
          <p className="mt-1 text-xs text-ink/70">Subir un comprobante no confirma el pago: la tienda lo revisa y confirma el ingreso.</p>
          {view.receipts.length > 0 && (
            <ul className="mt-2 divide-y divide-ink/10 text-sm" aria-label="Comprobantes subidos">
              {view.receipts.map((r) => (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1">
                  <span>{day(r.createdAt)}{r.declaredAmountMinor ? ` · ${formatARS(r.declaredAmountMinor)} (indicado por vos)` : ""}</span>
                  <span className="font-semibold">{receiptState[r.status] ?? r.status} · <a href={`/api/comprobantes/${r.id}${k}`} target="_blank" rel="noopener noreferrer" className="underline">Ver</a></span>
                  {r.rejectReason && <span className="w-full text-xs text-vermilion">{r.rejectReason}</span>}
                </li>
              ))}
            </ul>
          )}
          {view.canUploadReceipt ? <ReceiptUpload reference={view.reference} linkToken={linkToken} /> : <p className="mt-2 text-sm text-ink/70">Este pedido ya no admite comprobantes.</p>}
        </div>
      </div>

      <div className="mt-6" data-testid="bloque-articulos">
        <h3 className="text-base font-bold">Tus artículos</h3>
        <ul className="mt-2 divide-y divide-ink/10 text-sm">
          {view.items.map((i) => (
            <li key={i.lineId} className="py-2" data-testid="articulo">
              <p><b>{i.quantity} × {i.title}</b></p>
              <p className="mt-0.5 text-xs text-ink/75">
                {i.fulfillment === "stock"
                  ? `Entregadas: ${i.delivered} de ${i.quantity}`
                  : <>Llegaron a Argentina: {i.arrived}{i.inTransit ? ` · En camino: ${i.inTransit}` : ""}{i.notShipped ? ` · Todavía no viajaron: ${i.notShipped}` : ""} · Entregadas: {i.delivered} de {i.quantity}</>}
              </p>
              {i.shipments.length > 0 && <p className="mt-0.5 text-xs text-ink/75">{i.shipments.map((s) => `${s.quantity} en «${s.label}» (${SHIPMENT_LABEL[s.status as ShipmentStatus] ?? s.status})`).join(" · ")}</p>}
            </li>
          ))}
        </ul>
      </div>

      {(view.incidents.length > 0 || view.refunds.length > 0) && (
        <div className="mt-6 border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="bloque-novedades">
          <h3 className="text-base font-bold">Novedades</h3>
          <ul className="mt-2 space-y-1">
            {view.incidents.map((i) => <li key={i.id}>{INCIDENT_KIND_LABEL[i.kind] ?? "Novedad"} ({day(i.openedAt)}): {i.publicText ?? "Estamos revisándolo."} <b>{i.status === "resuelto" ? "Resuelto." : "En curso."}</b></li>)}
            {view.refunds.map((r) => <li key={r.id}>{REFUND_STATUS_LABEL[r.status] ?? r.status}: {formatARS(r.amountMinor)}{r.refundedAt ? ` (${day(r.refundedAt)})` : ""}.</li>)}
          </ul>
        </div>
      )}

      <div className="mt-6" data-testid="bloque-historial">
        <h3 className="text-base font-bold">Historial</h3>
        <ol className="mt-2 space-y-1.5 text-sm">
          {[...view.timeline].reverse().map((t, i) => <li key={i}><span className="text-xs font-semibold text-ink/75">{day(t.at)}</span> · {t.text}</li>)}
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center bg-emerald px-5 font-bold text-paper hover:bg-ink" data-testid="consultar-whatsapp">Consultar por WhatsApp</a> : <span className="text-sm text-ink/70" data-testid="whatsapp-demo">Modo demostración: todavía no hay un número de WhatsApp configurado.</span>}
        <span className="text-sm">Tu referencia: <b className="font-mono" data-testid="referencia-pedido">{view.reference}</b></span>
      </div>
    </section>
  );
}
