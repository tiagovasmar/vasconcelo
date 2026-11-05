"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ImportDocumentForm({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  return <form className="space-y-2" onSubmit={async (e) => {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const body = new FormData(form);
    setBusy(true);
    setResult(undefined);
    try {
      const res = await fetch("/api/admin/compras/adjuntos", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.error?.message ?? "No se pudo guardar el archivo." });
        return;
      }
      form.reset();
      setResult({ ok: true, text: "Adjunto guardado." });
      router.refresh();
    } catch {
      setResult({ ok: false, text: "No se pudo completar la subida. Reintentá." });
    } finally {
      setBusy(false);
    }
  }}>
    <input type="hidden" name="purchaseId" value={purchaseId} />
    <label className="block text-sm">Factura o comprobante (PDF o imagen, hasta 4 MB)
      <input className="mt-1 block w-full min-w-0 rounded-lg border border-ink/40 p-2 text-sm" type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required />
    </label>
    <button disabled={busy} className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper">{busy ? "Subiendo…" : "Adjuntar archivo"}</button>
    {result && <p role={result.ok ? "status" : "alert"} className="text-sm">{result.text}</p>}
  </form>;
}
