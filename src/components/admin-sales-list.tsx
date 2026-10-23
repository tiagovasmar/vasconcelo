"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatARS } from "@/lib/format";
import type { SaleView } from "@/features/sales/service";

const when = (ms: number) => new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(ms));

/** Historial de ventas. Nada se edita ni se borra: lo único posible es anular una venta (devuelve el stock y queda constancia). */
export function AdminSalesList({ sales }: { sales: SaleView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function anular(id: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/admin/ventas/${encodeURIComponent(id)}/anular`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error?.message ?? "No se pudo anular."); return; }
      setOpen(null); setReason("");
      router.refresh();
    } catch { setError("No hay conexión con el servidor. No se anuló nada."); } finally { setBusy(false); }
  }

  if (!sales.length) return <p className="rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70" data-testid="ventas-vacio">Todavía no registraste ventas.</p>;
  return (
    <ul className="space-y-3" data-testid="ventas-lista">
      {sales.map((s) => (
        <li key={s.id} className={`rounded-xl border bg-white p-4 ${s.status === "anulada" ? "border-vermilion/40" : "border-ink/15"}`} data-testid={`venta-${s.id}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-sm font-semibold">{s.id}{s.status === "anulada" && <span className="ml-2 rounded bg-vermilion px-2 py-0.5 font-sans text-xs font-bold text-white">ANULADA</span>}</p>
            <p className="text-sm text-ink/70">{when(s.createdAt)} · {s.createdByEmail}</p>
          </div>
          {s.inquiry && <p className="mt-1 text-sm" data-testid="venta-origen">Cliente: <b>{s.inquiry.name ?? "Sin nombre"}</b> · consulta <Link href={`/admin/consultas/${s.inquiry.id}`} className="font-mono underline underline-offset-4">{s.inquiry.id}</Link>{s.inquiry.kind === "vinculada" ? " (vinculada)" : ""}</p>}
          <ul className="mt-2 text-sm">
            {s.lines.map((l) => <li key={l.productId} className="flex justify-between gap-3"><span>{l.quantity} × {l.title}{l.packSize && !/pack de/i.test(l.title) ? ` (pack de ${l.packSize})` : ""} <span className="font-mono text-xs text-ink/70">{l.sku}</span></span><span className="shrink-0 text-right">{formatARS(l.unitPriceMinor)} {l.packSize ? "por pack" : "c/u"}{l.discountMinor > 0 && <span className="block text-xs font-semibold text-emerald" data-testid={`venta-desc-${l.productId}`}>−{formatARS(l.discountMinor)} ({l.discountKind === "combo" ? "combo caja + sobres" : l.discountKind === "transferencia" ? "transferencia" : l.discountKind === "mixto" ? "combo y transferencia" : "descuento"})</span>}</span></li>)}
          </ul>
          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-2 border-t border-ink/10 pt-2 text-sm"><span>{s.paymentLabel}{s.note ? ` · ${s.note}` : ""}</span><b className="text-lg">{formatARS(s.totalMinor)}</b></p>
          {s.status === "anulada" ? (
            <p className="mt-1 text-xs text-vermilion">Anulada el {s.voidedAt ? when(s.voidedAt) : ""} por {s.voidedByEmail}: {s.voidReason}. El stock se devolvió.</p>
          ) : open === s.id ? (
            <div className="mt-3 rounded-lg bg-paper p-3">
              <label htmlFor={`motivo-${s.id}`} className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Motivo de la anulación</label>
              <input id={`motivo-${s.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoComplete="off" className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base" data-testid="motivo-anulacion" />
              <p className="mt-1 text-xs text-ink/65">Devuelve el stock de esta venta y la deja marcada como anulada. No se puede deshacer.</p>
              {error && <p role="alert" className="mt-1 text-sm font-semibold text-vermilion">{error}</p>}
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => anular(s.id)} disabled={busy} className="min-h-11 rounded-lg bg-vermilion px-4 text-sm font-semibold text-white disabled:opacity-50" data-testid="confirmar-anulacion">{busy ? "Anulando…" : "Anular venta"}</button>
                <button type="button" onClick={() => { setOpen(null); setReason(""); setError(""); }} className="min-h-11 px-3 text-sm font-semibold underline">Cancelar</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setOpen(s.id); setError(""); }} className="mt-2 min-h-11 text-sm font-semibold underline hover:text-vermilion" data-testid={`anular-${s.id}`}>Anular esta venta…</button>
          )}
        </li>
      ))}
    </ul>
  );
}
