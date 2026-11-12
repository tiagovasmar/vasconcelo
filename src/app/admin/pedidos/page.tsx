import Link from "next/link";
import { getDb } from "@/db/client";
import { remainingOrderBalance, senaFor, STAGE_LABEL, stagesFor, type Stage } from "@/features/pedidos/etapas";
import { orderUsdEquivalent } from "@/features/pedidos/mayorista-costos";
import { formatRate, formatUSD } from "@/features/fx/convert";
import { listOrders } from "@/features/pedidos/service";
import { when } from "@/features/consultas/ui";
import { formatARS } from "@/lib/format";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const kindName = { stock: "Compra de stock", encargo: "Encargo", mayorista: "Mayorista" } as const;

/** Pedidos con seguimiento (compras confirmadas, encargos y mayoristas). La etapa logística y el estado del pago son cosas separadas. */
export default async function AdminPedidos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/pedidos");
  const sp = await searchParams;
  const kind = ["stock", "encargo", "mayorista"].includes(one(sp.tipo)) ? one(sp.tipo) : undefined;
  const stageOptions = stagesFor("mayorista");
  const search = kind === "mayorista" ? one(sp.q).trim().slice(0, 100) : "";
  const requestedStage = one(sp.etapa) as Stage;
  const stage = kind === "mayorista" && stageOptions.includes(requestedStage) ? requestedStage : undefined;
  const pending = sp.pendiente === "comprobantes" || sp.pendiente === "retiro" ? sp.pendiente : undefined;
  const rows = await listOrders(getDb(), { kind, search, stage, pending });
  const kindHref = (value?: string) => {
    const params = new URLSearchParams({ ...(value ? { tipo: value } : {}), ...(pending ? { pendiente: pending } : {}) });
    return `/admin/pedidos${params.size ? `?${params}` : ""}`;
  };
  const tab = (k: string | undefined, label: string) => <Link key={label} href={kindHref(k)} aria-current={kind === k ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${kind === k ? "border-ink bg-ink text-paper" : "border-ink/30 hover:bg-white"}`}>{label}</Link>;
  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{kind === "mayorista" ? "Pedidos mayoristas" : "Pedidos y encargos"}</h1>
        {kind === "mayorista" && <Link href="/admin/pedidos/nuevo-mayorista" className="inline-flex min-h-11 items-center rounded-md bg-emerald px-4 text-sm font-semibold text-paper">Nuevo pedido mayorista</Link>}
      </div>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">{kind === "mayorista" ? "Gestioná acá los pedidos del catálogo y los que recibís por WhatsApp u otros canales." : "Un pedido es una consulta con seguimiento: se abre al confirmar una venta, al recibirse un pedido mayorista o desde el detalle de cualquier consulta."}</p>
      <div className="mt-4 flex flex-wrap gap-2">{tab(undefined, "Todos")}{tab("stock", "Compras de stock")}{tab("encargo", "Encargos")}{tab("mayorista", "Mayoristas")}</div>
      {pending && <p className="mt-3 text-sm"><strong>{pending === "retiro" ? "Listos para retirar" : "Comprobantes por revisar"}</strong> · <Link href={kind ? `/admin/pedidos?tipo=${kind}` : "/admin/pedidos"} className="underline">Quitar filtro</Link></p>}
      {kind === "mayorista" && (
        <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/pedidos">
          <input type="hidden" name="tipo" value="mayorista" />
          {pending && <input type="hidden" name="pendiente" value={pending} />}
          <label className="grid gap-1 text-sm">Cliente, teléfono, referencia o guía
            <input name="q" defaultValue={search} maxLength={100} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" />
          </label>
          <label className="grid gap-1 text-sm">Etapa
            <select name="etapa" defaultValue={stage ?? ""} className="min-h-11 rounded-md border border-ink/40 bg-white px-3">
              <option value="">Todas</option>
              {stageOptions.map((option) => <option key={option} value={option}>{STAGE_LABEL[option]}</option>)}
            </select>
          </label>
          <button className="min-h-11 rounded-md bg-ink px-4 text-sm font-semibold text-paper">Filtrar</button>
          {(search || stage) && <Link href="/admin/pedidos?tipo=mayorista" className="self-center text-sm underline">Limpiar filtros</Link>}
        </form>
      )}
      <p role="status" className="mt-4 text-sm text-ink/70" data-testid="pedidos-cantidad">{rows.length} {rows.length === 1 ? "pedido" : "pedidos"}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">{search || stage || pending ? "No encontramos pedidos con esos filtros." : kind === "mayorista" ? "Todavía no hay pedidos mayoristas. Podés cargar el primero con «Nuevo pedido mayorista»." : <>Todavía no hay pedidos con seguimiento. Abrí uno desde <Link href="/admin/consultas" className="underline">Consultas</Link>.</>}</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-xl border border-ink/15 bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="bg-paper-2 text-left text-xs uppercase tracking-wide"><th className="p-2">Pedido</th><th className="p-2">{kind === "mayorista" ? "Seguimiento" : "Tipo"}</th><th className="p-2">Etapa</th><th className="p-2 text-right">Acordado</th><th className="p-2 text-right">Cobrado</th><th className="p-2">Pendientes</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const wholesale = r.kind === "mayorista";
                const amount = (minor: number) => {
                  const usd = wholesale && r.rate10k ? orderUsdEquivalent(minor, r.rate10k) : null;
                  return usd === null ? formatARS(minor) : formatUSD(usd);
                };
                const deposit = wholesale ? senaFor(r.agreedMinor) : null;
                const depositUsd = senaFor(r.agreedUsdMinor);
                const depositText = deposit === null ? null : depositUsd !== null && r.confirmedMinor >= deposit ? formatUSD(depositUsd) : amount(Math.min(deposit, r.confirmedMinor));
                return (
                <tr key={r.reference} className="border-t border-ink/10" data-testid="pedido-fila">
                  <td className="p-2"><Link href={`/admin/pedidos/${r.reference}`} className="font-mono font-semibold underline">{r.reference}</Link><span className="block text-xs text-ink/75">{r.name ?? "Sin nombre"} · {when(r.createdAt)}</span>{wholesale && r.phone && <span className="block text-xs text-ink/75">{r.phone}</span>}</td>
                  <td className="p-2">{kind === "mayorista" ? r.tracking ? <><span className="block text-xs">{r.carrier}</span><span className="break-all font-mono">{r.tracking}</span></> : "Sin guía" : kindName[r.kind]}</td>
                  <td className="p-2">{r.cancelled ? <b className="text-vermilion">Cancelado</b> : STAGE_LABEL[r.stage as Stage] ?? r.stage}</td>
                  <td className="p-2 text-right">{r.agreedMinor === null ? <span className="text-ink/75">A confirmar</span> : r.agreedUsdMinor === null ? formatARS(r.agreedMinor) : formatUSD(r.agreedUsdMinor)}{wholesale && r.rate10k && <span className="block text-xs text-ink/75">{formatRate(r.rate10k)} por USD</span>}</td>
                  <td className="p-2 text-right">{amount(r.confirmedMinor)}
                    {depositText !== null && <span className="block text-xs text-ink/75">Seña cubierta: {depositText}</span>}
                    {wholesale && r.agreedMinor !== null && !r.cancelled && <span className="block text-xs text-ink/75">Queda por pagar: {amount(remainingOrderBalance(r.agreedMinor, r.confirmedMinor)!)}</span>}
                  </td>
                  <td className="p-2 text-xs">
                    {r.pendingReceipts === 0 && !r.cancelled && r.stage === "listo_retiro" && <Link href={`/admin/pedidos/${r.reference}#entrega`} className="mr-2 font-semibold underline">Gestionar entrega</Link>}
                    {r.pendingReceipts > 0 && <Link href={`/admin/pedidos/${r.reference}#comprobantes`} className="mr-1 rounded bg-gold/40 px-1.5 py-0.5 font-semibold underline">{r.pendingReceipts} comprobante{r.pendingReceipts === 1 ? "" : "s"} por revisar</Link>}
                    {r.openIncidents > 0 && <span className="mr-1 rounded bg-vermilion/15 px-1.5 py-0.5 font-semibold text-vermilion">{r.openIncidents} incidente{r.openIncidents === 1 ? "" : "s"}</span>}
                    {r.failedNotices > 0 && <span className="rounded bg-ink/10 px-1.5 py-0.5 font-semibold">{r.failedNotices} aviso{r.failedNotices === 1 ? "" : "s"} sin enviar</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
