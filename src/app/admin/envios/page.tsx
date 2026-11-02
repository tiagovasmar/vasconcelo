import Link from "next/link";
import { AdminButton, AdminForm } from "@/components/admin-form";
import { getDb } from "@/db/client";
import { when } from "@/features/consultas/ui";
import { listShipments, shippableLines } from "@/features/pedidos/envios";
import { SHIPMENT_LABEL, SHIPMENT_STATUSES, shipmentRank, type ShipmentStatus } from "@/features/pedidos/etapas";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
const dateOf = (s: Awaited<ReturnType<typeof listShipments>>[number], st: ShipmentStatus) => ({ preparando: s.createdAt, enviado_proveedor: s.sentAt, recibido_origen: s.originReceivedAt, en_transito: s.transitAt, recibido_argentina: s.arrivedAt })[st];

/** Envíos internacionales agrupados: llevan artículos de varios encargos o pedidos mayoristas. Avanzarlos refleja el viaje SOLO en los artículos (y cantidades) que viajaron en cada uno. */
export default async function AdminEnvios() {
  await requireAdmin("/admin/envios");
  const db = getDb();
  const [shipments, lines] = await Promise.all([listShipments(db), shippableLines(db)]);
  const EP = "/api/admin/envios";
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Envíos internacionales agrupados</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">Mercadería encargada o en tránsito no es stock propio: no suma al stock de la tienda. Un envío puede llevar artículos de varios pedidos y un pedido puede llegar en varios envíos. Cada estado se carga con su fecha real y solo avanza.</p>

      <section className={card}>
        <h2 className="text-base font-semibold">Crear un envío</h2>
        <AdminForm endpoint={EP} fixed={{ action: "create" }} fields={[
          { name: "label", label: "Nombre del envío", required: true, placeholder: "Ej.: Lote noviembre" },
          { name: "supplier", label: "Proveedor (opcional)", optional: true },
          { name: "internalNote", label: "Nota interna (opcional)", optional: true },
        ]} submit="Crear envío" ok="Envío creado." testId="form-envio-nuevo" />
      </section>

      {shipments.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">Todavía no hay envíos.</p>}
      {shipments.map((s) => {
        const prep = s.status === "preparando";
        const nextOptions = SHIPMENT_STATUSES.filter((x) => x !== "preparando" && shipmentRank(x) > shipmentRank(s.status)).map((x) => ({ value: x, label: SHIPMENT_LABEL[x] }));
        return (
          <section key={s.id} className={card} data-testid="envio">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{s.label} <span className="font-mono text-xs text-ink/55">{s.id}</span></h2>
              <span className="rounded-full bg-gold/30 px-3 py-1 text-sm font-semibold ring-1 ring-gold" data-testid="envio-estado">{SHIPMENT_LABEL[s.status as ShipmentStatus]}</span>
            </div>
            <ol className="mt-2 flex flex-wrap gap-2 text-xs">{SHIPMENT_STATUSES.map((st) => { const at = dateOf(s, st); return <li key={st} className={`rounded-full px-2.5 py-1 ring-1 ${at && shipmentRank(st) <= shipmentRank(s.status) ? "bg-emerald/10 ring-emerald/40" : "ring-ink/20 text-ink/55"}`}>{SHIPMENT_LABEL[st]}{at && shipmentRank(st) <= shipmentRank(s.status) ? ` · ${when(at)}` : ""}</li>; })}</ol>
            {s.supplier && <p className="mt-1 text-xs text-ink/65">Proveedor: {s.supplier}</p>}
            <ul className="mt-3 divide-y divide-ink/10 text-sm" aria-label="Artículos del envío">
              {s.items.map((it) => (
                <li key={it.lineId} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid="envio-item">
                  <span>{it.quantity} × {it.title} <Link href={`/admin/pedidos/${it.inquiryId}`} className="font-mono text-xs underline">{it.inquiryId}</Link></span>
                  {prep && <AdminButton endpoint={EP} body={{ action: "remove_item", shipmentId: s.id, lineId: it.lineId }} label="Quitar" ok="Quitado." />}
                </li>
              ))}
              {s.items.length === 0 && <li className="py-1.5 text-ink/60">Sin artículos todavía.</li>}
            </ul>
            {prep && lines.length > 0 && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <h3 className="text-sm font-semibold">Sumar un artículo de un pedido comprado al proveedor</h3>
                <AdminForm endpoint={EP} compact idempotent={false} fixed={{ action: "item", shipmentId: s.id }} fields={[
                  { name: "lineId", label: "Artículo", type: "select", required: true, options: lines.map((l) => ({ value: String(l.lineId), label: `${l.title} · ${l.inquiryId} · sin enviar: ${l.notShipped}` })) },
                  { name: "quantity", label: "Cantidad en este envío", type: "int", required: true },
                ]} submit="Sumar al envío" ok="Artículo sumado." />
              </div>
            )}
            {nextOptions.length > 0 && s.items.length > 0 && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <h3 className="text-sm font-semibold">Avanzar el envío</h3>
                <p className="mb-2 text-xs text-ink/70">Se refleja solo en los artículos de este envío. Si con esto todas las unidades de un pedido alcanzaron la etapa, el pedido avanza; si no, los demás artículos siguen como «todavía no viajaron».</p>
                <AdminForm endpoint={EP} fixed={{ action: "status", shipmentId: s.id }} fields={[
                  { name: "status", label: "Nuevo estado", type: "select", required: true, options: nextOptions },
                  { name: "occurredAt", label: "Fecha real", type: "date", required: true },
                  { name: "publicNote", label: "Nota para las clientes (opcional)", optional: true },
                ]} submit="Actualizar envío" ok="Envío actualizado." testId="form-envio-estado" />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
