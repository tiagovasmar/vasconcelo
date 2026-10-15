"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Ajuste del aviso de stock bajo (solo dentro del panel): «avisar cuando queden N unidades o menos». 0 = sin aviso. */
export function AdminLowStockSettings({ threshold, custom, updatedAt, updatedBy, lowCount }: { threshold: number; custom: boolean; updatedAt: number | null; updatedBy: string | null; lowCount: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = value.trim();
  const valid = /^\d{1,3}$/.test(t);
  const dirty = valid && Number(t) !== threshold;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setMsg({ ok: false, text: "Escribí un número entero entre 0 y 999 (0 = sin aviso)." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lowStockThreshold: Number(t) }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: body?.error?.message ?? "No se pudo guardar. Intentá de nuevo." });
        return;
      }
      setMsg({ ok: true, text: Number(t) === 0 ? "Aviso de stock bajo desactivado." : `Listo: se avisa cuando quedan ${t} unidades o menos.` });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-ink/15 bg-white px-4 py-3" aria-label="Aviso de stock bajo" data-testid="ajuste-stock-bajo">
      <div>
        <label htmlFor="umbral-stock" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Aviso de stock bajo: cuando queden…</label>
        <div className="mt-1 flex items-center gap-2">
          <input id="umbral-stock" inputMode="numeric" autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value); setMsg(null); }} aria-invalid={!valid} className="block min-h-11 w-24 rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30" data-testid="umbral-stock" />
          <span className="text-sm text-ink/75">unidades o menos (0 = sin aviso)</span>
        </div>
      </div>
      <button type="submit" disabled={busy || !dirty} className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50" data-testid="guardar-umbral">{busy ? "…" : "Guardar aviso"}</button>
      <p className="min-w-0 flex-1 basis-60 text-xs text-ink/65">
        Solo marca productos publicados con entre 1 y {threshold || "N"} unidades dentro de este panel ({lowCount} ahora). No cambia la tienda ni envía correos ni mensajes.
        {custom && updatedAt ? ` Último cambio: ${new Date(updatedAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}${updatedBy ? ` · ${updatedBy}` : ""}.` : " Valor inicial sugerido: 3."}
      </p>
      <p role="status" aria-live="polite" className={`basis-full text-sm font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mensaje-umbral">{msg?.text}</p>
    </form>
  );
}
