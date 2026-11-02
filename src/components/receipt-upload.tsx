"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const MAX = 4 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

/**
 * Adjuntar el comprobante de una transferencia. Valida tipo y tamaño antes de subir (la validación real es del servidor), conserva lo elegido si falla la red
 * y nunca afirma que el pago quedó confirmado: queda «en revisión».
 */
export function ReceiptUpload({ reference, linkToken }: { reference: string; linkToken?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function choose(f: File | null) {
    setMsg(null);
    if (f && f.size > MAX) { setFile(null); setMsg({ ok: false, text: `El archivo pesa ${(f.size / 1024 / 1024).toFixed(1)} MB y el máximo es 4 MB.` }); return; }
    if (f && !ACCEPT.split(",").includes(f.type) && !/\.(jpe?g|png|webp|pdf)$/i.test(f.name)) { setFile(null); setMsg({ ok: false, text: "Solo se admiten fotos (JPG, PNG, WebP) o PDF." }); return; }
    setFile(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) { setMsg({ ok: false, text: "Elegí el archivo del comprobante." }); return; }
    const body = new FormData();
    body.set("file", file);
    if (amount.trim()) body.set("declaredAmount", amount.trim());
    if (note.trim()) body.set("note", note.trim());
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/pedidos/${encodeURIComponent(reference)}/comprobantes${linkToken ? `?k=${encodeURIComponent(linkToken)}` : ""}`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No pudimos subir el comprobante. Intentá de nuevo." }); return; }
      setMsg({ ok: true, text: data.duplicate ? "Ese comprobante ya estaba cargado: no se duplicó." : "Recibimos tu comprobante. Queda en revisión: todavía no confirma el pago." });
      setFile(null); setAmount(""); setNote("");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se subió nada: el archivo sigue elegido, reintentá." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2" data-testid="subir-comprobante">
      <div>
        <label htmlFor="comprobante-archivo" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Adjuntar comprobante (JPG, PNG, WebP o PDF · hasta 4 MB)</label>
        <input ref={input} id="comprobante-archivo" type="file" accept={ACCEPT} onChange={(e) => choose(e.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:border-0 file:bg-ink file:px-4 file:font-semibold file:text-paper" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor="comprobante-importe" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Importe transferido (opcional)</label>
          <input id="comprobante-importe" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ 0" className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base" />
        </div>
        <div>
          <label htmlFor="comprobante-nota" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Nota (opcional)</label>
          <input id="comprobante-nota" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base" />
        </div>
      </div>
      <button type="submit" disabled={busy} className="min-h-11 bg-ink px-5 text-sm font-bold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Subiendo…" : "Subir comprobante"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`} data-testid="comprobante-mensaje">{msg.text}</p>}
    </form>
  );
}
