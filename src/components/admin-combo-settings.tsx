"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ComboCandidate = { id: string; title: string; sku: string; language: string; priceLabel: string; stockLabel: string };

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";

/**
 * Configuración de la promoción caja + sobres: activar o desactivar y elegir qué cajas y qué sobres participan. Solo guarda la lista; no modifica ningún precio.
 * Mientras no esté configurada (o esté apagada) el carrito no aplica ningún descuento de combo.
 */
export function AdminComboSettings({ enabled: enabled0, boxes, boosters, boxIds: boxIds0, boosterIds: boosterIds0, version, updatedLabel, headline }: {
  enabled: boolean; boxes: ComboCandidate[]; boosters: ComboCandidate[]; boxIds: string[]; boosterIds: string[]; version: number; updatedLabel: string | null; headline: string;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(enabled0);
  const [boxIds, setBoxIds] = useState(new Set(boxIds0));
  const [boosterIds, setBoosterIds] = useState(new Set(boosterIds0));
  const [ver, setVer] = useState(version);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fb, setFb] = useState("");
  const [fs, setFs] = useState("");

  const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
  const dirty = enabled !== enabled0 || !same(boxIds, boxIds0) || !same(boosterIds, boosterIds0);
  const shownBoxes = useMemo(() => boxes.filter((b) => !fb.trim() || norm(`${b.title} ${b.sku}`).includes(norm(fb.trim()))), [boxes, fb]);
  const shownBoosters = useMemo(() => boosters.filter((b) => !fs.trim() || norm(`${b.title} ${b.sku}`).includes(norm(fs.trim()))), [boosters, fs]);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setter(n); setMsg(null); };
  const bulk = (set: Set<string>, setter: (s: Set<string>) => void, ids: string[], on: boolean) => { const n = new Set(set); for (const id of ids) { if (on) n.add(id); else n.delete(id); } setter(n); setMsg(null); };
  const problem = enabled && (boxIds.size === 0 || boosterIds.size === 0) ? "Para activarla elegí al menos una caja y un sobre participantes." : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (problem) { setMsg({ ok: false, text: problem }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/promociones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, boxIds: [...boxIds], boosterIds: [...boosterIds], expectedVersion: ver }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No se pudo guardar. Intentá de nuevo." }); return; }
      setVer(data.version);
      setMsg({ ok: true, text: enabled ? "Guardado. La promoción está ACTIVADA para las cajas y los sobres elegidos." : "Guardado. La promoción está desactivada." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada." });
    } finally {
      setBusy(false);
    }
  }

  const list = (title: string, items: ComboCandidate[], shown: ComboCandidate[], sel: Set<string>, setter: (s: Set<string>) => void, filter: string, setFilter: (s: string) => void, tid: string) => (
    <fieldset className="min-w-0 rounded-xl border border-ink/15 bg-white p-4" data-testid={tid}>
      <legend className="px-1 text-base font-semibold">{title} <span className="text-sm font-normal text-ink/70" data-testid={`${tid}-cuenta`}>({sel.size} elegidos de {items.length})</span></legend>
      <label htmlFor={`${tid}-filtro`} className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Buscar</label>
      <input id={`${tid}-filtro`} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} autoComplete="off" placeholder="Nombre o SKU" className={field} />
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <button type="button" onClick={() => bulk(sel, setter, shown.map((x) => x.id), true)} className="min-h-11 underline underline-offset-4">Elegir los {shown.length} que se ven</button>
        <button type="button" onClick={() => bulk(sel, setter, shown.map((x) => x.id), false)} className="min-h-11 underline underline-offset-4">Quitar los que se ven</button>
      </div>
      <ul className="mt-1 max-h-96 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10">
        {shown.length === 0 && <li className="px-3 py-3 text-sm text-ink/70">Ningún producto coincide.</li>}
        {shown.map((x) => (
          <li key={x.id}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 px-3 py-2 hover:bg-gold/20">
              <input type="checkbox" checked={sel.has(x.id)} onChange={() => toggle(sel, setter, x.id)} className="mt-1 h-5 w-5 shrink-0 accent-emerald" data-testid={`combo-${tid}-${x.id}`} />
              <span className="min-w-0 text-sm"><b className="block leading-tight">{x.title}</b><span className="text-xs text-ink/65"><span className="font-mono">{x.sku}</span> · {x.language} · {x.priceLabel} · {x.stockLabel}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );

  return (
    <form onSubmit={save} noValidate className="mt-6 space-y-6" data-testid="form-combo" aria-label="Promoción caja + sobres">
      <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base font-semibold">
          <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setMsg(null); }} className="h-6 w-6 accent-emerald" data-testid="combo-activada" />
          Promoción activada
        </label>
        <p className="mt-2 max-w-3xl text-sm text-ink/80">«{headline}». Cada caja participante del pedido habilita 10% de descuento en hasta 5 sobres participantes (2 cajas, hasta 10, y así). Si hay más sobres que cupos, el descuento va primero a los de mayor precio unitario.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink/70">
          <li>No cambia los precios normales de ningún producto: es un descuento que se calcula en el pedido.</li>
          <li>El descuento del combo es el mismo con cualquier medio de pago. Los accesorios no participan.</li>
          <li>La promoción es para pedidos minoristas.</li>
          <li>Mientras esté desactivada o sin productos elegidos, el carrito no aplica ningún descuento de combo.</li>
        </ul>
        <p className="mt-2 text-xs text-ink/65">{updatedLabel ? `Último cambio: ${updatedLabel}.` : "Todavía no se configuró: está apagada."}</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {list("Cajas participantes", boxes, shownBoxes, boxIds, setBoxIds, fb, setFb, "cajas")}
        {list("Sobres participantes", boosters, shownBoosters, boosterIds, setBoosterIds, fs, setFs, "sobres")}
      </div>

      {problem && <p className="text-sm font-semibold text-vermilion" data-testid="combo-problema">{problem}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !dirty} className="min-h-12 rounded-lg bg-emerald px-6 text-base font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50" data-testid="combo-guardar">{busy ? "Guardando…" : "Guardar promoción"}</button>
        <p role="status" aria-live="polite" className={`text-sm font-semibold ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : "text-ink/70"}`} data-testid="combo-mensaje">{msg?.text ?? (dirty ? "Hay cambios sin guardar." : "Todo guardado.")}</p>
      </div>
    </form>
  );
}
