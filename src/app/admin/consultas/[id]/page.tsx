import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminInquiryActions, AdminLinkSale, AdminSaleVoid } from "@/components/admin-inquiry-actions";
import { getDb } from "@/db/client";
import { crmLabel, getInquiryDetail, listLinkableSales, type CrmStatus } from "@/features/consultas/service";
import { deliveryText, paymentText, when } from "@/features/consultas/ui";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = { created: "Alta", contact_confirmed: "Contacto confirmado", contact_unconfirmed: "Contacto desmarcado", status: "Estado", note: "Nota", sale_created: "Venta registrada", sale_linked: "Venta vinculada", sale_voided: "Venta anulada" };

export default async function AdminConsultaDetalle({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const aviso = (await searchParams).venta;
  await requireAdmin(`/admin/consultas/${id}`);
  const db = getDb();
  const d = await getInquiryDetail(db, id);
  if (!d) notFound();
  const { inquiry: i, lines, events, sales } = d;
  const status = i.crmStatus as CrmStatus;
  const linkable = d.activeSale ? [] : (await listLinkableSales(db)).map((s) => ({ id: s.id, label: `${s.id} · ${formatARS(s.totalMinor)} · ${when(s.createdAt)}` }));
  const name = i.contactName ?? d.accountName ?? "Sin nombre";
  const fx = i.fxRate10k ? `${(i.fxRate10k / 10_000).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} pesos por dólar (${i.fxMode === "manual" ? "manual" : "automática"}${i.fxSource ? `, ${i.fxSource}` : ""})` : null;
  const encargos = lines.filter((l) => l.fulfillment === "encargo");

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="text-sm"><Link href="/admin/consultas" className="underline underline-offset-4">← Consultas</Link></p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-emerald">Consulta <span className="font-mono" data-testid="consulta-id">{i.id}</span></p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl" data-testid="consulta-nombre">{name}</h1>
          <p className="mt-1 text-sm text-ink/75">{i.contactPhone ? <>Tel. <span data-testid="consulta-telefono">{i.contactPhone}</span> · </> : "Sin teléfono · "}{d.accountEmail ? `cuenta ${d.accountEmail} · ` : "sin cuenta · "}{when(i.createdAt)} · {i.source === "manual" ? "cargada a mano" : "generada desde la tienda"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-gold/30 px-3 py-1 text-sm font-semibold ring-1 ring-gold" data-testid="detalle-estado">{crmLabel[status]}</span>
          <span className="rounded-full border border-ink/30 px-3 py-1 text-sm font-semibold" data-testid="detalle-contacto">{i.contactConfirmedAt ? `Contacto confirmado · ${when(i.contactConfirmedAt)}` : "Consulta generada · contacto sin confirmar"}</span>
        </div>
      </div>
      {(aviso === "ok" || aviso === "repetida") && d.activeSale && (
        <p role="status" className="mt-4 rounded-xl border border-emerald/40 bg-emerald/10 p-3 text-sm font-semibold" data-testid="venta-registrada-aviso">
          {aviso === "repetida" ? "Esa venta ya estaba registrada" : "Venta registrada"}: {d.activeSale.id} por {formatARS(d.activeSale.totalMinor)}. El stock ya se descontó{aviso === "repetida" ? " (una sola vez)" : ""} y la consulta quedó como «Convertida en venta».
        </p>
      )}
      {status === "no_concretada" && i.lostReason && <p className="mt-3 rounded-lg bg-ink/5 p-3 text-sm" data-testid="motivo-guardado"><b>Motivo:</b> {i.lostReason}</p>}

      <section className="mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-labelledby="h-original" data-testid="consulta-original">
        <h2 id="h-original" className="text-base font-semibold">Consulta original</h2>
        <p className="mt-1 text-xs text-ink/70">Es una copia del momento en que se confirmó el pedido: no cambia aunque después cambien precios o productos.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs text-ink/70"><th className="py-1 pr-2">Producto</th><th className="pr-2">Cant.</th><th className="pr-2">Precio cotizado</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-ink/10" data-testid="original-linea">
                  <td className="py-1.5 pr-2">{l.title}{l.packSize ? <span className="text-ink/60"> (pack de {l.packSize})</span> : null} <span className="text-ink/60">· <span className="font-mono">{l.sku}</span>{l.baseCurrency ? ` · precio base ${l.baseCurrency}` : ""}</span>{l.fulfillment === "encargo" && <span className="ml-1 rounded bg-gold/30 px-1.5 text-xs font-semibold">por encargo</span>}
                    {l.comboDiscountMinor > 0 && <span className="block text-xs font-semibold text-emerald">Combo caja + sobres: 10% OFF en {l.comboUnits} {l.comboUnits === 1 ? "sobre" : "sobres"} (−{formatARS(l.comboDiscountMinor)})</span>}
                    {l.transferDiscountMinor > 0 && <span className="block text-xs font-semibold text-emerald">Transferencia: −{formatARS(l.transferDiscountMinor)}</span>}</td>
                  <td className="pr-2">{l.quantity}</td>
                  <td className="pr-2">{l.fulfillment === "encargo" && l.unitPriceMinor === 0 ? "sin cotizar" : formatARS(l.unitPriceMinor)}</td>
                  <td className="text-right">{l.fulfillment === "encargo" && l.unitPriceMinor === 0 ? "—" : formatARS(l.lineSubtotalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatARS(i.subtotalMinor)}</dd></div>
          <div className="flex justify-between"><dt>Descuento por transferencia</dt><dd>{i.discountMinor ? `− ${formatARS(i.discountMinor)}` : "—"}</dd></div>
          <div className="flex justify-between"><dt>Descuento combo caja + sobres</dt><dd data-testid="original-combo">{i.comboDiscountMinor ? `− ${formatARS(i.comboDiscountMinor)}` : "—"}</dd></div>
          <div className="flex justify-between sm:col-span-2 font-semibold"><dt>Total cotizado</dt><dd data-testid="original-total">{formatARS(i.subtotalMinor - i.discountMinor - i.comboDiscountMinor)}</dd></div>
          <div className="flex justify-between sm:col-span-2"><dt>Moneda / cotización</dt><dd className="text-right">{i.currency}{fx ? ` · ${fx}` : " · sin conversión de dólar"}</dd></div>
          <div className="flex justify-between sm:col-span-2"><dt>Entrega</dt><dd className="text-right">{deliveryText(i.deliveryJson) || "—"}</dd></div>
          <div className="flex justify-between sm:col-span-2"><dt>Pago</dt><dd className="text-right">{paymentText(i.paymentPreference) || "—"}</dd></div>
        </dl>
        <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Ver el mensaje preparado</summary><pre className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs">{i.message}</pre></details>
      </section>

      {d.activeSale ? (
        <section className="mt-6 rounded-xl border border-emerald bg-emerald/5 p-4 sm:p-5" aria-labelledby="h-venta" data-testid="venta-vigente">
          <h2 id="h-venta" className="text-base font-semibold">Venta vigente</h2>
          <p className="mt-1 text-sm">
            <span className="font-mono font-semibold" data-testid="venta-vigente-id">{d.activeSale.id}</span> · {formatARS(d.activeSale.totalMinor)} · registrada el {when(d.activeSale.createdAt)} · {d.activeSale.linkKind === "vinculada" ? "vinculada (el stock ya estaba descontado)" : "descontó el stock de lo vendido"}
          </p>
          <div className="mt-3"><AdminSaleVoid id={d.activeSale.id} /></div>
        </section>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href={`/admin/consultas/${i.id}/convertir`} className="inline-flex min-h-11 items-center rounded-lg bg-emerald px-5 text-sm font-semibold text-paper hover:bg-emerald-2" data-testid="convertir-venta">Convertir en venta</Link>
          <span className="text-xs text-ink/70">Vas a poder revisar y editar la venta, ver el total y cómo quedaría el stock antes de confirmar.{encargos.length ? " Los productos por encargo no entran en la venta (no salen de tu stock)." : ""}</span>
        </div>
      )}

      <div className="mt-6"><AdminInquiryActions id={i.id} status={status} contactConfirmed={Boolean(i.contactConfirmedAt)} converted={Boolean(d.activeSale)} reason={i.lostReason ?? ""} /></div>
      {!d.activeSale && <div className="mt-6"><AdminLinkSale inquiryId={i.id} options={linkable} /></div>}

      {sales.some((s) => !s.linkActive) && (
        <section className="mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-labelledby="h-anuladas" data-testid="ventas-anuladas">
          <h2 id="h-anuladas" className="text-base font-semibold">Ventas anteriores de esta consulta (anuladas)</h2>
          <ul className="mt-2 space-y-1 text-sm">{sales.filter((s) => !s.linkActive).map((s) => <li key={s.id}><span className="font-mono">{s.id}</span> · {formatARS(s.totalMinor)} · anulada el {s.voidedAt ? when(s.voidedAt) : "—"}{s.voidReason ? ` · ${s.voidReason}` : ""}</li>)}</ul>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-labelledby="h-historial">
        <h2 id="h-historial" className="text-base font-semibold">Historial</h2>
        <ol className="mt-3 space-y-3" data-testid="historial-consulta">
          {events.map((e) => (
            <li key={e.id} className="border-l-4 border-emerald pl-3 text-sm" data-testid="evento">
              <p className="text-xs text-ink/65">{when(e.createdAt)} · {e.actorEmail ?? "Sistema"} · <b>{kindLabel[e.kind] ?? e.kind}</b></p>
              <p className="whitespace-pre-wrap">{e.detail}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
