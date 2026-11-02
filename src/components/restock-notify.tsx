"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "./account-provider";
import { RESTOCK_CONSENT_TEXT } from "@/features/avisos/consent";

/**
 * «Avisame cuando vuelva» en un producto agotado. Es un aviso por correo: no reserva stock, no garantiza el precio y no es una consulta ni una compra.
 * Pide consentimiento expreso. Se puede cancelar enseguida desde acá (y siempre desde el enlace del propio correo o desde la cuenta).
 */
export function RestockNotify({ productId, title }: { productId: string; title: string }) {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<{ token: string | null; replayed: boolean } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const storageKey = `aviso-${productId}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setDone({ token: saved, replayed: true });
    } catch { /* sin almacenamiento: se muestra el formulario */ }
  }, [storageKey]);

  const logged = Boolean(account?.user);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!consent) { setMsg({ ok: false, text: "Para anotarte tenés que aceptar que te enviemos el aviso." }); return; }
    if (!logged && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setMsg({ ok: false, text: "Escribí un correo válido." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/avisos-reposicion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, consent: true, ...(logged ? {} : { email: email.trim() }) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No pudimos anotarte. Intentá de nuevo." }); return; }
      try { if (data.cancelToken) window.localStorage.setItem(storageKey, data.cancelToken); } catch { /* opcional */ }
      setDone({ token: data.cancelToken ?? null, replayed: Boolean(data.replayed) });
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se guardó nada: tus datos siguen acá, reintentá." });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!done?.token || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/avisos-reposicion/cancelar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: done.token }) });
      if (!res.ok) { setMsg({ ok: false, text: "No pudimos cancelar el aviso ahora. Reintentá." }); return; }
      try { window.localStorage.removeItem(storageKey); } catch { /* opcional */ }
      setCancelled(true);
      setDone(null);
      setMsg({ ok: true, text: "Cancelamos tu aviso. No te vamos a escribir por este producto." });
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se canceló: reintentá." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 border border-ink/25 bg-white p-4" aria-labelledby={`aviso-title-${productId}`} data-testid="avisame">
      <h3 id={`aviso-title-${productId}`} className="text-base font-extrabold">Avisame cuando vuelva</h3>
      {done ? (
        <div role="status" className="mt-2 text-sm" data-testid="avisame-listo">
          <p className="font-semibold text-emerald">{done.replayed ? "Ya estás anotado/a." : "Listo, te anotamos."} Te escribimos una sola vez cuando «{title}» vuelva a estar disponible.</p>
          <p className="mt-1 text-xs text-ink/70">El aviso no reserva stock ni garantiza el precio: se vende hasta agotar.</p>
          {done.token && <button type="button" onClick={cancel} disabled={busy} className="mt-2 min-h-11 border border-ink/40 px-4 text-sm font-semibold hover:bg-paper disabled:opacity-50" data-testid="avisame-cancelar">Cancelar aviso</button>}
          {!done.token && <p className="mt-2 text-xs"><Link href="/cuenta/avisos" className="underline">Gestionar mis avisos</Link> · o usá el enlace de cancelación de nuestro correo.</p>}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-2 space-y-3">
          <p className="text-sm text-ink/80">Dejanos {logged ? "tu aviso" : "tu correo"} y te escribimos cuando haya stock. No es una compra ni una consulta.</p>
          {!logged && (
            <div>
              <label htmlFor={`aviso-mail-${productId}`} className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Correo electrónico</label>
              <input id={`aviso-mail-${productId}`} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base" />
            </div>
          )}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" data-testid="avisame-consentimiento" /><span>{RESTOCK_CONSENT_TEXT}</span></label>
          <button type="submit" disabled={busy} className="min-h-11 bg-ink px-5 text-sm font-bold text-paper hover:bg-emerald disabled:opacity-50" data-testid="avisame-enviar">{busy ? "Anotando…" : "Avisame"}</button>
          {logged && <p className="text-xs text-ink/75">Usamos el correo verificado de tu cuenta.</p>}
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
      {cancelled && <p className="sr-only">Aviso cancelado</p>}
    </section>
  );
}
