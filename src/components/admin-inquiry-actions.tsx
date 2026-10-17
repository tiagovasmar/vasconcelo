"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";
const btn = "min-h-11 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

async function call(url: string, method: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; text: string }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, text: data?.error?.message ?? "No se pudo guardar. Intentá de nuevo." };
    return { ok: true, data };
  } catch {
    return { ok: false, text: "No hay conexión con el servidor. No se guardó nada." };
  }
}

/** Gestión de una consulta: contacto confirmado, estado (con motivo opcional) y notas internas. Nada de esto toca el stock. */
export function AdminInquiryActions({ id, status, contactConfirmed, converted, reason }: { id: string; status: string; contactConfirmed: boolean; converted: boolean; reason: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [next, setNext] = useState(status === "convertida" ? "en_seguimiento" : status);
  const [why, setWhy] = useState(reason);
  const [note, setNote] = useState("");

  async function run(body: Record<string, unknown>, okText: string, after?: () => void) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const r = await call(`/api/admin/consultas/${id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: r.text }); return; }
    setMsg({ ok: true, text: r.data.changed === false ? "Sin cambios: ya estaba así." : okText });
    after?.();
    router.refresh();
  }

  return (
    <section className="space-y-5 rounded-xl border border-ink/15 bg-white p-4 sm:p-5" aria-label="Gestionar consulta" data-testid="acciones-consulta">
      <div>
        <h2 className="text-base font-semibold">Contacto</h2>
        <p className="mt-1 text-xs text-ink/70">Abrir WhatsApp no demuestra que el mensaje se haya enviado. Marcalo cuando efectivamente hablaste con la persona.</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {contactConfirmed ? (
            <button type="button" disabled={busy || converted} onClick={() => run({ action: "unconfirm_contact" }, "Se desmarcó el contacto.")} className={`${btn} border border-ink/40 hover:bg-paper`} data-testid="desmarcar-contacto">Desmarcar contacto</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => run({ action: "confirm_contact" }, "Contacto confirmado.")} className={`${btn} bg-emerald text-paper hover:bg-emerald-2`} data-testid="confirmar-contacto">Confirmar contacto</button>
          )}
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void run({ action: "set_status", status: next, reason: next === "no_concretada" ? why.trim() || null : null }, "Estado actualizado."); }}>
        <h2 className="text-base font-semibold">Estado</h2>
        {converted ? (
          <p className="mt-1 text-sm text-ink/80">Tiene una venta vigente. Para cambiar el estado, anulá primero la venta: la consulta vuelve a «En seguimiento».</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink/70">Cambiar de estado no reserva ni descuenta stock. «Convertida en venta» se alcanza solo registrando o vinculando una venta.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <div><label htmlFor="estado-nuevo" className={lbl}>Estado</label>
                <select id="estado-nuevo" value={next} onChange={(e) => setNext(e.target.value)} className={field} data-testid="estado-nuevo">
                  <option value="pendiente">Pendiente</option><option value="en_seguimiento">En seguimiento</option><option value="no_concretada">No concretada</option>
                </select></div>
              {next === "no_concretada" ? (
                <div><label htmlFor="motivo" className={lbl}>Motivo (opcional)</label><input id="motivo" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={300} placeholder="Ej.: le pareció caro" className={field} data-testid="motivo" /></div>
              ) : <div />}
              <button type="submit" disabled={busy} className={`${btn} bg-ink text-paper hover:bg-emerald`} data-testid="guardar-estado">Guardar estado</button>
            </div>
          </>
        )}
      </form>

      <form onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run({ action: "note", text: note.trim() }, "Nota agregada.", () => setNote("")); }}>
        <label htmlFor="nota-nueva" className="text-base font-semibold">Nota interna</label>
        <p className="mt-1 text-xs text-ink/70">Solo la ves vos. Queda en el historial con fecha y hora y no se edita.</p>
        <textarea id="nota-nueva" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-2 block w-full rounded-md border border-ink/40 bg-white px-3 py-2 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30" data-testid="nota-nueva" />
        <button type="submit" disabled={busy || !note.trim()} className={`${btn} mt-2 bg-ink text-paper hover:bg-emerald`} data-testid="agregar-nota">Agregar nota</button>
      </form>

      <p role="status" aria-live="polite" className={`text-sm font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mensaje-consulta">{msg?.text}</p>
    </section>
  );
}

/** Anular la venta vigente de una consulta (usa la misma anulación del sistema de ventas: devuelve el stock una sola vez y pide un motivo). */
export function AdminSaleVoid({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    if (reason.trim().length < 5) { setMsg("Escribí el motivo de la anulación (entre 5 y 200 caracteres)."); return; }
    setBusy(true);
    setMsg(null);
    const r = await call(`/api/admin/ventas/${encodeURIComponent(id)}/anular`, "POST", { reason: reason.trim() });
    setBusy(false);
    if (!r.ok) { setMsg(r.text); return; }
    setOpen(false);
    router.refresh();
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={`${btn} border border-vermilion text-vermilion hover:bg-vermilion/10`} data-testid="anular-venta">Anular venta</button>;
  return (
    <div role="group" aria-label="Confirmar anulación" className="rounded-lg border border-vermilion bg-vermilion/5 p-4" data-testid="confirmar-anulacion-consulta">
      <p className="text-sm font-semibold">¿Anular esta venta?</p>
      <p className="mt-1 text-sm text-ink/80">Las unidades que descontó vuelven al stock (una sola vez), la venta queda marcada «anulada» y la consulta vuelve a «En seguimiento»: deja de contar como conversión y podés convertirla de nuevo.</p>
      <label htmlFor="motivo-anulacion-consulta" className={`${lbl} mt-3`}>Motivo</label>
      <input id="motivo-anulacion-consulta" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} autoComplete="off" className={field} data-testid="motivo-anulacion-consulta" />
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" onClick={go} disabled={busy} className={`${btn} bg-vermilion text-white`} data-testid="confirmar-anular">{busy ? "Anulando…" : "Sí, anular"}</button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className={`${btn} border border-ink/40 hover:bg-paper`}>No, volver</button>
      </div>
      {msg && <p role="alert" className="mt-2 text-sm font-medium text-vermilion">{msg}</p>}
    </div>
  );
}

/** Vincular una venta ya registrada (que ya descontó su stock) a esta consulta. No cambia el stock. */
export function AdminLinkSale({ inquiryId, options }: { inquiryId: string; options: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !pick) return;
    setBusy(true);
    setMsg(null);
    const r = await call(`/api/admin/ventas/${encodeURIComponent(pick)}/vincular`, "POST", { inquiryId });
    setBusy(false);
    if (!r.ok) { setMsg(r.text); return; }
    router.refresh();
  }
  return (
    <form onSubmit={go} className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5" data-testid="vincular-venta">
      <h2 className="text-base font-semibold">Vincular una venta ya registrada</h2>
      <p className="mt-1 text-xs text-ink/70">Si la venta ya está cargada en «Ventas» (y ya descontó su stock), vinculala a esta consulta. <b>No vuelve a descontar stock.</b></p>
      {options.length === 0 ? (
        <p className="mt-2 text-sm text-ink/70">No hay ventas vigentes sin consulta para vincular.</p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div><label htmlFor="venta-vincular" className={lbl}>Venta</label>
            <select id="venta-vincular" value={pick} onChange={(e) => setPick(e.target.value)} className={field} data-testid="venta-vincular"><option value="">Elegí una venta…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
          <button type="submit" disabled={busy || !pick} className={`${btn} bg-ink text-paper hover:bg-emerald`} data-testid="confirmar-vincular">{busy ? "Vinculando…" : "Vincular"}</button>
        </div>
      )}
      {msg && <p role="alert" className="mt-2 text-sm font-medium text-vermilion">{msg}</p>}
    </form>
  );
}
