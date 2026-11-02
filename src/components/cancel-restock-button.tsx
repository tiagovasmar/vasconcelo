"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Cancela un aviso de reposición (por enlace secreto o, desde la cuenta, por id). Reintentar es seguro: cancelar dos veces no hace nada. */
export function CancelRestockButton({ token, id, label = "Sí, cancelar el aviso" }: { token?: string; id?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/avisos-reposicion/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(token ? { token } : { id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No pudimos cancelar el aviso. Intentá de nuevo." }); return; }
      setMsg({ ok: true, text: "Listo: cancelamos el aviso." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se canceló nada: reintentá." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={go} disabled={busy || msg?.ok === true} className="min-h-11 bg-ink px-5 text-sm font-bold text-paper hover:bg-emerald disabled:opacity-50" data-testid="cancelar-aviso">{busy ? "Cancelando…" : label}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
    </div>
  );
}
