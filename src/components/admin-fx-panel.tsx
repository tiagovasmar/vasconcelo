"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatARS } from "@/lib/format";
import { formatUSD, parseRateInput, usdToArsMinor } from "@/features/fx/convert";
import { useUnsavedGuard } from "./use-unsaved-guard";

export type FxPanelData = {
  mode: "auto" | "manual";
  status: "none" | "fresh" | "stale" | "expired" | "manual";
  /** Textos ya formateados en el servidor (con su zona horaria). */
  rateLabel: string | null;
  autoRateLabel: string | null;
  providerUpdated: string | null;
  fetchedAt: string | null;
  fetchedAge: string | null;
  lastAttempt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  manualRateLabel: string | null;
  manualSetAt: string | null;
  manualSetBy: string | null;
  manualNote: string | null;
  manualOld: boolean;
  rate10k: number | null;
  /** Valor sugerido para el campo manual (el vigente, o el último manual). */
  suggested: string;
  products: Array<{ id: string; title: string; usdMinor: number; arsMinor: number | null }>;
  log: Array<{ id: number; when: string; kind: string; text: string }>;
  refreshEnabled: boolean;
};

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const label = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";
const btn = "min-h-11 rounded-lg border border-ink/40 bg-white px-4 text-sm font-medium hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";
const primary = "min-h-11 rounded-lg bg-emerald px-5 text-sm font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50";

const STATUS: Record<FxPanelData["status"], { text: string; cls: string }> = {
  fresh: { text: "Automática · al día", cls: "bg-emerald text-paper" },
  stale: { text: "Automática · vieja (se usa con aviso)", cls: "bg-gold text-ink" },
  expired: { text: "Automática · vencida (NO se convierte)", cls: "bg-vermilion text-white" },
  none: { text: "Sin cotización utilizable", cls: "bg-vermilion text-white" },
  manual: { text: "Manual · fijada por la tienda", cls: "bg-ink text-paper" },
};

export function AdminFxPanel({ data }: { data: FxPanelData }) {
  const router = useRouter();
  const [manual, setManual] = useState(data.suggested);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [candidate, setCandidate] = useState(data.suggested);

  const manualParsed = parseRateInput(manual);
  const manualDirty = manual.trim() !== data.suggested.trim() || note.trim() !== "";
  useUnsavedGuard(manualDirty && manual.trim() !== "" && manualParsed !== null && manual.trim() !== data.suggested.trim());

  const candRate = parseRateInput(candidate);
  const cand10k = candRate === null ? null : Math.round(candRate * 10000);
  const preview = useMemo(() => data.products.map((p) => ({ ...p, next: cand10k ? usdToArsMinor(p.usdMinor, cand10k) : null })), [data.products, cand10k]);

  async function call(action: "refresh" | "auto" | "manual") {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "manual" ? { action, rate: manual, note: note.trim() || undefined } : { action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error?.message ?? "No se pudo completar la operación." });
        return;
      }
      setMsg({ ok: true, text: action === "refresh" ? (body.changed ? "Cotización actualizada." : "Se consultó al proveedor: el valor no cambió.") : action === "auto" ? "Volvió el modo automático." : "Cotización manual guardada: rige hasta que vuelvas a automático." });
      if (action === "manual") setNote("");
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Sin conexión con el servidor. No se cambió nada." });
    } finally {
      setBusy(null);
    }
  }

  const st = STATUS[data.status];
  return (
    <div className="space-y-8">
      <section aria-labelledby="h-vigente" className="rounded-xl border border-ink/15 bg-white p-4 sm:p-6" data-testid="fx-vigente">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="h-vigente" className="text-lg font-semibold">Cotización vigente</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`} data-testid="fx-estado">{st.text}</span>
        </div>
        <p className="mt-3 text-3xl font-semibold" data-testid="fx-valor">{data.rateLabel ?? "Sin cotización"}</p>
        <p className="text-sm text-ink/70">por dólar · dólar blue, valor de venta{data.mode === "manual" ? " (valor manual)" : ""}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-ink/65">Fuente</dt><dd>DolarAPI (<span className="font-mono text-xs">dolarapi.com/v1/dolares/blue</span>): servicio de terceros, no una cotización oficial del BCRA.</dd></div>
          <div><dt className="text-xs text-ink/65">Último valor automático</dt><dd data-testid="fx-auto">{data.autoRateLabel ?? "—"}</dd></div>
          <div><dt className="text-xs text-ink/65">Publicado por el proveedor (su fecha)</dt><dd data-testid="fx-proveedor">{data.providerUpdated ?? "—"}</dd></div>
          <div><dt className="text-xs text-ink/65">Última consulta exitosa (la nuestra)</dt><dd data-testid="fx-consulta">{data.fetchedAt ? `${data.fetchedAt} (${data.fetchedAge})` : "Nunca"}</dd></div>
          <div><dt className="text-xs text-ink/65">Último intento</dt><dd>{data.lastAttempt ?? "—"}</dd></div>
          {data.mode === "manual" && <div><dt className="text-xs text-ink/65">Valor manual</dt><dd data-testid="fx-manual">{data.manualRateLabel} · cargado {data.manualSetAt}{data.manualSetBy ? ` por ${data.manualSetBy}` : ""}{data.manualNote ? ` · «${data.manualNote}»` : ""}</dd></div>}
        </dl>
        {data.lastError && <p className="mt-4 rounded-lg border border-vermilion/50 bg-vermilion/5 p-3 text-sm" data-testid="fx-error"><b>Error al actualizar{data.lastErrorAt ? ` (${data.lastErrorAt})` : ""}:</b> {data.lastError} {data.status === "expired" || data.status === "none" ? "Sin cotización utilizable, los precios en pesos quedan pendientes." : "Se sigue usando la última cotización válida."}</p>}
        {data.mode === "manual" && data.manualOld && <p className="mt-4 rounded-lg border border-gold bg-gold/20 p-3 text-sm" data-testid="fx-manual-vieja">El valor manual tiene más de 7 días. Sigue vigente porque lo elegiste vos; revisalo o volvé a automático.</p>}
        {data.status === "stale" && <p className="mt-4 rounded-lg border border-gold bg-gold/20 p-3 text-sm">La última consulta exitosa es más vieja de lo habitual: la tienda lo avisa en el detalle de la cotización.</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className={btn} onClick={() => call("refresh")} disabled={busy !== null || !data.refreshEnabled} data-testid="fx-consultar">{busy === "refresh" ? "Consultando…" : "Consultar ahora"}</button>
          {data.mode === "manual" && <button type="button" className={primary} onClick={() => call("auto")} disabled={busy !== null} data-testid="fx-volver-auto">Volver a automático</button>}
          {!data.refreshEnabled && <span className="text-xs text-ink/65">Las consultas de red están desactivadas en este entorno (FX_AUTO_REFRESH=0).</span>}
        </div>
        <p role="status" aria-live="polite" className={`mt-3 text-sm font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="fx-mensaje">{msg?.text}</p>
      </section>

      <section aria-labelledby="h-manual" className="rounded-xl border border-ink/15 bg-white p-4 sm:p-6">
        <h2 id="h-manual" className="text-lg font-semibold">Fijar una cotización manual</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/70">Sirve si el proveedor falla o querés usar otro valor. Queda <b>explícita y persistente</b>: no se reemplaza sola; rige hasta que vuelvas al modo automático. Las consultas ya preparadas no cambian.</p>
        <form onSubmit={(e) => { e.preventDefault(); void call("manual"); }} className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end" noValidate>
          <div>
            <label htmlFor="fx-manual-in" className={label}>Pesos por dólar</label>
            <input id="fx-manual-in" value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="Ej.: 1425" className={field} aria-invalid={manual.trim() !== "" && manualParsed === null} data-testid="fx-manual-input" />
          </div>
          <div>
            <label htmlFor="fx-manual-note" className={label}>Nota (opcional)</label>
            <input id="fx-manual-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ej.: proveedor caído, valor del banco" className={field} />
          </div>
          <button type="submit" className={primary} disabled={busy !== null || manualParsed === null} data-testid="fx-guardar-manual">{busy === "manual" ? "Guardando…" : "Fijar valor manual"}</button>
        </form>
        {manual.trim() !== "" && manualParsed === null && <p className="mt-2 text-xs font-medium text-vermilion">Escribí un número positivo, por ejemplo 1425 o 1.425,50.</p>}
      </section>

      <section aria-labelledby="h-previa" className="rounded-xl border border-ink/15 bg-white p-4 sm:p-6" data-testid="fx-previa">
        <h2 id="h-previa" className="text-lg font-semibold">Vista previa del efecto sobre los precios</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink/70">Probá una cotización y mirá cómo cambiarían los precios unitarios en pesos. No guarda nada.</p>
        <div className="mt-3 max-w-xs">
          <label htmlFor="fx-cand" className={label}>Cotización a probar</label>
          <input id="fx-cand" value={candidate} onChange={(e) => setCandidate(e.target.value)} inputMode="decimal" autoComplete="off" className={field} data-testid="fx-candidata" />
        </div>
        {data.products.length === 0 ? (
          <p className="mt-4 text-sm text-ink/70">Todavía no hay productos con precio en USD cargado.</p>
        ) : (
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Efecto de la cotización probada sobre los precios">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink/65"><tr><th className="py-2 pr-3">Producto</th><th className="px-3 py-2">USD</th><th className="px-3 py-2">Hoy</th><th className="px-3 py-2">Con la cotización probada</th></tr></thead>
              <tbody className="divide-y divide-ink/10">
                {preview.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">{p.title}</td>
                    <td className="px-3 py-2">{formatUSD(p.usdMinor)}</td>
                    <td className="px-3 py-2">{p.arsMinor === null ? "pendiente" : formatARS(p.arsMinor)}</td>
                    <td className="px-3 py-2 font-semibold">{p.next === null ? "—" : formatARS(p.next)}{p.next !== null && p.arsMinor !== null && p.next !== p.arsMinor ? <span className="ml-2 text-xs font-normal text-ink/65">({p.next > p.arsMinor ? "+" : "−"}{formatARS(Math.abs(p.next - p.arsMinor))})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="h-hist" className="rounded-xl border border-ink/15 bg-white p-4 sm:p-6">
        <h2 id="h-hist" className="text-lg font-semibold">Historial de la cotización</h2>
        {data.log.length === 0 ? <p className="mt-2 text-sm text-ink/70">Todavía no hay movimientos.</p> : (
          <ul className="mt-3 divide-y divide-ink/10 text-sm" data-testid="fx-historial">
            {data.log.map((l) => <li key={l.id} className="py-2"><span className="text-ink/65">{l.when}</span> · {l.text}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
