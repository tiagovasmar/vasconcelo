"use client";

import { useState } from "react";

/**
 * Genera el enlace privado de seguimiento de un pedido de invitado. El enlace completo se muestra UNA sola vez (en la base solo queda su hash);
 * generar uno nuevo invalida el anterior. Se comparte con la persona por WhatsApp.
 */
export function AccessLinkButton({ inquiryId }: { inquiryId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function make() {
    if (busy) return;
    if (!window.confirm("Se genera un enlace nuevo y el anterior deja de funcionar. ¿Continuar?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/admin/pedidos/${encodeURIComponent(inquiryId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "access_link" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data?.error?.message ?? "No se pudo generar el enlace."); return; }
      setUrl(`${window.location.origin}/seguimiento/${inquiryId}?k=${data.token}`);
    } catch {
      setMsg("No hay conexión con el servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={make} disabled={busy} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-semibold hover:bg-paper disabled:opacity-50" data-testid="generar-enlace">Generar enlace privado de seguimiento</button>
      {url && (
        <div className="mt-2" data-testid="enlace-generado">
          <label htmlFor="enlace-privado" className="block text-xs font-semibold">Copialo y enviáselo a la persona (no se vuelve a mostrar):</label>
          <input id="enlace-privado" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 font-mono text-xs" />
        </div>
      )}
      {msg && <p role="alert" className="mt-1 text-sm font-semibold text-vermilion">{msg}</p>}
    </div>
  );
}
