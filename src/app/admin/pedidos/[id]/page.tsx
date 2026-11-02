import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessLinkButton } from "@/components/access-link-button";
import { AdminButton, AdminForm } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { when } from "@/features/consultas/ui";
import { SHIPMENT_LABEL, STAGE_LABEL, stagesFor, type ShipmentStatus, type Stage, type TrackKind } from "@/features/pedidos/etapas";
import { adminOrderDetail, INCIDENT_KIND_LABEL } from "@/features/pedidos/service";
import { PAYMENT_STATUS_LABEL, summarizePayments } from "@/features/pedidos/etapas";
import { averageCosts } from "@/features/costos/service";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const kindName = { stock: "Compra de stock", encargo: "Encargo", mayorista: "Pedido mayorista" } as const;
const noticeState: Record<string, string> = { pendiente: "Pendiente", enviando: "Enviando", enviado: "Enviado", fallido: "Falló" };
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const h2 = "text-base font-semibold";

export default async function AdminPedidoDetalle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/pedidos/${id}`);
  const db = getDb();
  const d = await adminOrderDetail(db, id);
  if (!d) notFound();
  const { inquiry: i, track, events, payments, receipts, incidents, refunds, items, totals, notices, deliveries } = d;
  const ep = `/api/admin/pedidos/${id}`;
  const kind = (track?.kind ?? "stock") as TrackKind;
  const pay = summarizePayments({ agreedMinor: track?.agreedMinor ?? null, ...totals });
  const stageOptions = stagesFor(kind).map((s) => ({ value: s, label: STAGE_LABEL[s] }));
  const pendingReceipts = receipts.filter((r) => r.status === "pendiente_revision");
  const avg = await averageCosts(db, [...new Set(items.map((x) => x.productId))]);
  const refunded = refunds.reduce((n, r) => n + r.amountMinor, 0);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm"><Link href="/admin/pedidos" className="underline underline-offset-4">← Pedidos</Link> · <Link href={`/admin/consultas/${id}`} className="underline underline-offset-4">Ver la consulta original</Link></p>
      <p className="eyebrow mt-3 text-emerald">{kindName[kind]} <span className="font-mono">{id}</span></p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{i.contactName ?? "Sin nombre"}</h1>
      <p className="mt-1 text-sm text-ink/75">{i.userId ? "Con cuenta" : "Invitado"} · {i.contactPhone ?? "sin teléfono"} · {when(i.createdAt)}</p>

      {!track ? (
        <section className={card}>
          <h2 className={h2}>Todavía sin seguimiento</h2>
          <p className="mt-1 text-sm text-ink/75">Abrí el seguimiento cuando confirmes el pedido. La cliente lo ve en su cuenta (o por un enlace privado si compró como invitada).</p>
          <div className="mt-3"><AdminButton endpoint={ep} body={{ action: "open" }} label="Abrir seguimiento" ok="Seguimiento abierto." /></div>
        </section>
      ) : (
        <>
          <section className={card} data-testid="admin-etapa">
            <h2 className={h2}>Etapa del pedido</h2>
            <p className="mt-1 text-lg font-bold" data-testid="admin-etapa-actual">{track.cancelledAt ? "Cancelado" : STAGE_LABEL[track.stage as Stage]}</p>
            <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Etapas">
              {stagesFor(kind).map((s) => { const done = events.some((e) => e.kind === "stage" && e.stage === s); return <li key={s} className={`rounded-full px-2.5 py-1 ring-1 ${s === track.stage ? "bg-emerald text-paper ring-emerald" : done ? "bg-emerald/10 ring-emerald/40" : "ring-ink/20 text-ink/60"}`}>{STAGE_LABEL[s]}</li>; })}
            </ol>
            {!track.cancelledAt && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-ink/70">Cargá cada etapa con su fecha real. Las etapas de transporte internacional las gobiernan los <Link href="/admin/envios" className="underline">envíos agrupados</Link>: el pedido avanza solo cuando todas sus unidades llegaron a esa etapa. Algunas etapas exigen el importe acordado, la seña o el pago completo confirmados.</p>
                <AdminForm endpoint={ep} fields={[
                  { name: "stage", label: "Nueva etapa", type: "select", options: stageOptions, required: true, defaultValue: track.stage },
                  { name: "occurredAt", label: "Fecha real", type: "date", required: true },
                  { name: "publicNote", label: "Nota para la cliente (opcional)", optional: true, maxLength: 300 },
                  { name: "internalNote", label: "Nota interna (opcional)", optional: true, maxLength: 500 },
                  { name: "correction", label: "Corregir una etapa cargada por error (retroceder)", type: "checkbox" },
                ]} fixed={{ action: "stage" }} submit="Guardar etapa" ok="Etapa guardada." testId="form-etapa" />
              </div>
            )}
          </section>

          <section className={card} data-testid="admin-pago">
            <h2 className={h2}>Pago (separado de la logística)</h2>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-ink/60">Importe acordado</dt><dd className="font-extrabold">{track.agreedMinor === null ? "A confirmar" : formatARS(track.agreedMinor)}</dd></div>
              <div><dt className="text-xs text-ink/60">Confirmado</dt><dd className="font-extrabold">{formatARS(totals.confirmedMinor)}</dd></div>
              <div><dt className="text-xs text-ink/60">Estado</dt><dd className="font-semibold">{PAYMENT_STATUS_LABEL[pay.status]}</dd></div>
            </dl>
            {d.senaMinor !== null && kind !== "stock" && <p className="mt-1 text-xs text-ink/70">Seña del 20%: {formatARS(d.senaMinor)} · saldo del 80% al llegar a Argentina, antes del despacho o del retiro.</p>}
            {!track.cancelledAt && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <h3 className="text-sm font-semibold">Importe acordado</h3>
                <p className="mb-2 text-xs text-ink/70">Lo confirma la tienda (producto, disponibilidad e importe). Después del primer pago confirmado ya no se puede cambiar.</p>
                <AdminForm endpoint={ep} compact fixed={{ action: "agreed" }} fields={[{ name: "agreedMinor", label: "Importe acordado", type: "pesos", required: true, defaultValue: track.agreedMinor ? String(track.agreedMinor / 100) : "" }]} submit="Guardar importe" ok="Importe guardado." idempotent={false} testId="form-importe" />
              </div>
            )}
            <ul className="mt-4 divide-y divide-ink/10 text-sm" aria-label="Pagos">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="pago-fila">
                  <span><b>{formatARS(p.amountMinor)}</b> · {p.kind} · {p.method} · {when(p.paidAt)} <span className="font-mono text-xs text-ink/55">{p.id}</span>{p.status === "anulado" && <b className="ml-2 text-vermilion">ANULADO ({p.voidReason})</b>}</span>
                  {p.status === "confirmado" && <AdminForm endpoint={ep} compact fixed={{ action: "void_payment", paymentId: p.id }} fields={[{ name: "reason", label: "Motivo de la anulación", required: true }]} submit="Anular pago" ok="Pago anulado." confirmText="¿Anular este pago? Queda registrado como anulado." idempotent={false} />}
                </li>
              ))}
            </ul>
            {!track.cancelledAt && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <h3 className="text-sm font-semibold">Registrar un ingreso confirmado</h3>
                <p className="mb-2 text-xs text-ink/70">Registralo recién cuando viste el dinero en tu cuenta. Si viene de un comprobante, elegilo para dejarlo aceptado.</p>
                <AdminForm endpoint={ep} fixed={{ action: "payment" }} fields={[
                  { name: "kind", label: "Tipo", type: "select", required: true, options: kind === "stock" ? [{ value: "pago_total", label: "Pago total" }, { value: "otro", label: "Otro pago" }] : [{ value: "sena", label: "Seña" }, { value: "saldo", label: "Saldo" }, { value: "pago_total", label: "Pago total" }, { value: "otro", label: "Otro" }] },
                  { name: "amountMinor", label: "Importe", type: "pesos", required: true },
                  { name: "method", label: "Medio", type: "select", required: true, options: [{ value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" }, { value: "otro", label: "Otro" }] },
                  { name: "paidAt", label: "Fecha real del ingreso", type: "date", required: true },
                  { name: "receiptId", label: "Comprobante que respalda el pago", type: "select", optional: true, options: pendingReceipts.map((r) => ({ value: r.id, label: `${r.id} · ${when(r.createdAt)}${r.declaredAmountMinor ? ` · dice ${formatARS(r.declaredAmountMinor)}` : ""}` })) },
                  { name: "internalNote", label: "Nota interna (opcional)", optional: true },
                ]} submit="Confirmar ingreso" ok="Ingreso confirmado." testId="form-pago" />
              </div>
            )}
          </section>

          <section className={card} data-testid="admin-comprobantes">
            <h2 className={h2}>Comprobantes subidos</h2>
            <p className="mt-1 text-xs text-ink/70">Son archivos privados. Subirlos no confirma nada: vos confirmás el ingreso arriba.</p>
            {receipts.length === 0 ? <p className="mt-2 text-sm text-ink/60">Ninguno todavía.</p> : (
              <ul className="mt-2 divide-y divide-ink/10 text-sm">
                {receipts.map((r) => (
                  <li key={r.id} className="py-2" data-testid="comprobante-fila">
                    <p><b className="font-mono">{r.id}</b> · {when(r.createdAt)} · {r.uploaderKind} · {r.status === "pendiente_revision" ? <b className="text-vermilion">Pendiente de revisión</b> : r.status === "aceptado" ? "Aceptado" : `Rechazado (${r.rejectReason})`} · <a href={`/api/comprobantes/${r.id}`} target="_blank" rel="noopener noreferrer" className="underline">Abrir</a></p>
                    {r.declaredAmountMinor && <p className="text-xs text-ink/65">La persona dice haber transferido {formatARS(r.declaredAmountMinor)}{r.note ? ` · «${r.note}»` : ""}</p>}
                    {r.status === "pendiente_revision" && <div className="mt-1"><AdminForm endpoint={ep} compact fixed={{ action: "reject_receipt", receiptId: r.id }} fields={[{ name: "reason", label: "Motivo del rechazo", required: true }]} submit="Rechazar comprobante" ok="Comprobante rechazado." idempotent={false} /></div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card} data-testid="admin-articulos">
            <h2 className={h2}>Artículos, entregas parciales y costo</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-ink/70"><th className="py-1 pr-2">Artículo</th><th className="pr-2">Pedido</th><th className="pr-2">Llegó</th><th className="pr-2">En camino</th><th className="pr-2">Sin enviar</th><th className="pr-2">Entregado</th><th>Costo</th></tr></thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l.lineId} className="border-t border-ink/10" data-testid="admin-articulo">
                      <td className="py-1.5 pr-2">{l.title}<span className="block text-xs text-ink/55">{l.fulfillment}{l.shipments.length ? ` · ${l.shipments.map((s) => `${s.quantity} en ${s.label} (${SHIPMENT_LABEL[s.status as ShipmentStatus]})`).join(", ")}` : ""}</span></td>
                      <td className="pr-2">{l.quantity}</td><td className="pr-2">{l.arrived}</td><td className="pr-2">{l.inTransit}</td><td className="pr-2">{l.notShipped}</td><td className="pr-2">{l.delivered}</td>
                      <td className="text-xs">{avg.has(l.productId) ? `Prom. ${formatARS(avg.get(l.productId)!)}` : <b>Costo pendiente</b>}{kind !== "stock" && avg.has(l.productId) && <span className="ml-1"><AdminButton endpoint={ep} body={{ action: "apply_cost", lineId: l.lineId }} label="Aplicar" ok="Costo aplicado." /></span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!track.cancelledAt && items.some((l) => l.deliverable > 0) && (
              <div className="mt-4 border-t border-ink/10 pt-4">
                <h3 className="text-sm font-semibold">Registrar una entrega (parcial o total)</h3>
                <p className="mb-2 text-xs text-ink/70">Solo se puede entregar lo que ya llegó a Argentina y no se entregó. El pedido figura entregado cuando no queda ninguna unidad por entregar.</p>
                <AdminForm endpoint={ep} fixed={{ action: "delivery" }} fields={[
                  { name: "lineId", label: "Artículo", type: "select", required: true, options: items.filter((l) => l.deliverable > 0).map((l) => ({ value: String(l.lineId), label: `${l.title} (listas: ${l.deliverable})` })) },
                  { name: "quantity", label: "Cantidad entregada", type: "int", required: true },
                  { name: "method", label: "Cómo", type: "select", required: true, options: [{ value: "retiro", label: "Retiró en el local" }, { value: "envio", label: "Se envió" }] },
                  { name: "deliveredAt", label: "Fecha real", type: "date", required: true },
                  { name: "publicNote", label: "Nota para la cliente (opcional)", optional: true },
                ]} submit="Registrar entrega" ok="Entrega registrada." testId="form-entrega" />
              </div>
            )}
            {deliveries.length > 0 && <p className="mt-3 text-xs text-ink/65">{deliveries.length} entrega(s) registrada(s).</p>}
          </section>

          <section className={card} data-testid="admin-incidentes">
            <h2 className={h2}>Incidentes y reintegros</h2>
            <p className="mt-1 text-xs text-ink/70">Cancelar un pedido NO significa que el dinero ya fue reintegrado. El sistema no transfiere nada: registrás el reintegro a devolver y, cuando lo hiciste, lo marcás con fecha y constancia.</p>
            <ul className="mt-2 space-y-2 text-sm">
              {incidents.map((x) => (
                <li key={x.id} className="rounded-lg bg-paper-2 p-3" data-testid="incidente-fila">
                  <b>{INCIDENT_KIND_LABEL[x.kind] ?? x.kind}</b> · {when(x.openedAt)} · {x.status === "abierto" ? <b className="text-vermilion">Abierto</b> : `Resuelto: ${x.resolution}`}
                  {x.internalDetail && <span className="block text-xs text-ink/65">Interno: {x.internalDetail}</span>}
                  {x.status === "abierto" && <div className="mt-2"><AdminForm endpoint={ep} compact fixed={{ action: "resolve_incident", incidentId: x.id }} fields={[{ name: "resolution", label: "Cómo se resolvió", required: true }, { name: "resolvedAt", label: "Fecha", type: "date", required: true }]} submit="Marcar resuelto" ok="Incidente resuelto." idempotent={false} /></div>}
                </li>
              ))}
              {refunds.map((r) => (
                <li key={r.id} className="rounded-lg bg-paper-2 p-3" data-testid="reintegro-fila">
                  <b>Reintegro {formatARS(r.amountMinor)}</b> · {r.status === "reintegrado" ? <>Reintegrado el {when(r.refundedAt!)} · constancia: {r.evidence}</> : <b className="text-vermilion">Pendiente de devolución</b>}
                  {r.status === "pendiente" && <div className="mt-2"><AdminForm endpoint={ep} compact fixed={{ action: "mark_refunded", refundId: r.id }} fields={[{ name: "refundedAt", label: "Fecha en que lo devolviste", type: "date", required: true }, { name: "evidence", label: "Constancia (n.º de operación)", required: true }]} submit="Marcar como reintegrado" ok="Reintegro registrado." confirmText="¿Confirmás que ya devolviste este dinero? Queda registrado con fecha y constancia." idempotent={false} /></div>}
                </li>
              ))}
            </ul>
            {totals.confirmedMinor > 0 && <p className="mt-2 text-xs text-ink/65">Pagado y confirmado: {formatARS(totals.confirmedMinor)} · registrado para reintegrar: {formatARS(refunded)}.</p>}
            <div className="mt-4 grid gap-6 border-t border-ink/10 pt-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Abrir un incidente</h3>
                <AdminForm endpoint={ep} fixed={{ action: "incident" }} fields={[
                  { name: "kind", label: "Tipo", type: "select", required: true, options: Object.entries(INCIDENT_KIND_LABEL).map(([v, l]) => ({ value: v, label: l })) },
                  { name: "openedAt", label: "Fecha", type: "date", required: true },
                  { name: "publicText", label: "Qué ve la cliente (opcional)", optional: true, type: "textarea", maxLength: 300 },
                  { name: "internalDetail", label: "Detalle interno (opcional)", optional: true, type: "textarea" },
                ]} submit="Registrar incidente" ok="Incidente registrado." />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Registrar un reintegro a devolver</h3>
                <AdminForm endpoint={ep} fixed={{ action: "refund" }} fields={[
                  { name: "amountMinor", label: "Importe", type: "pesos", required: true },
                  { name: "incidentId", label: "Incidente relacionado (opcional)", type: "select", optional: true, options: incidents.map((x) => ({ value: x.id, label: `${INCIDENT_KIND_LABEL[x.kind] ?? x.kind} · ${when(x.openedAt)}` })) },
                  { name: "internalNote", label: "Nota interna (opcional)", optional: true },
                ]} submit="Registrar reintegro" ok="Reintegro registrado como pendiente." />
              </div>
            </div>
          </section>

          <section className={card}>
            <h2 className={h2}>Notas, enlace privado y cancelación</h2>
            <div className="mt-3 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Agregar una nota</h3>
                <AdminForm endpoint={ep} fixed={{ action: "note" }} fields={[
                  { name: "publicText", label: "Nota PÚBLICA (la ve la cliente)", type: "textarea", optional: true, maxLength: 400 },
                  { name: "internalText", label: "Nota INTERNA (solo vos)", type: "textarea", optional: true },
                ]} submit="Agregar nota" ok="Nota agregada." />
              </div>
              <div className="space-y-4">
                {!i.userId && (
                  <div>
                    <h3 className="text-sm font-semibold">Acceso de invitado</h3>
                    <p className="mb-2 text-xs text-ink/70">Esta persona compró sin cuenta. Solo ve su pedido desde el mismo navegador o con un enlace privado que le compartas.</p>
                    <AccessLinkButton inquiryId={id} />
                  </div>
                )}
                {!track.cancelledAt && track.stage !== "entregado" && (
                  <div>
                    <h3 className="text-sm font-semibold">Cancelar el pedido</h3>
                    <p className="mb-2 text-xs text-ink/70">No devuelve dinero ni stock. Los reintegros se registran arriba.</p>
                    <AdminForm endpoint={ep} fixed={{ action: "cancel" }} fields={[{ name: "reason", label: "Motivo (interno)", required: true }, { name: "publicText", label: "Mensaje para la cliente (opcional)", optional: true }]} submit="Cancelar pedido" ok="Pedido cancelado." confirmText="¿Cancelar este pedido? No se puede deshacer." />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={card} data-testid="admin-avisos">
            <h2 className={h2}>Avisos por correo de este pedido</h2>
            {notices.length === 0 ? <p className="mt-2 text-sm text-ink/60">Ninguno (las compras de invitados no reciben correos: ven el estado en la web).</p> : (
              <ul className="mt-2 divide-y divide-ink/10 text-sm">
                {notices.map((n) => <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span>{n.subject} · {when(n.createdAt)} · <b className={n.status === "enviado" ? "text-emerald" : "text-vermilion"}>{noticeState[n.status] ?? n.status}</b>{n.lastError ? ` (${n.lastError})` : ""}</span>{n.status !== "enviado" && <AdminButton endpoint="/api/admin/avisos" body={{ ids: [n.id] }} label="Reintentar" ok="Reintento hecho." />}</li>)}
              </ul>
            )}
          </section>
        </>
      )}

      <section className={card} data-testid="admin-historial">
        <h2 className={h2}>Historial completo (con notas internas)</h2>
        <ol className="mt-2 space-y-1.5 text-sm">
          {events.map((e) => <li key={e.id}><span className="text-xs text-ink/60">{when(e.occurredAt)}</span> · <b>{e.kind}</b>{e.publicText ? ` · ${e.publicText}` : ""}{e.internalText ? <span className="text-vermilion"> · [interno] {e.internalText}</span> : null}{e.actorEmail ? <span className="text-xs text-ink/50"> · {e.actorEmail}</span> : null}</li>)}
        </ol>
      </section>
    </div>
  );
}
