"use client";

import { useEffect, useRef, useState } from "react";

/** Copiar el mensaje (con alternativa si el portapapeles no está disponible) y abrir/reabrir WhatsApp. */
export function ConsultaActions({ waUrl, text, autoOpen, summaryMode, fullText }: { waUrl: string | null; text: string; autoOpen: boolean; summaryMode: boolean; fullText: string }) {
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const [which, setWhich] = useState<"msg" | "full">("msg");
  const area = useRef<HTMLTextAreaElement>(null);
  const opened = useRef(false); // evita abrir dos veces (p. ej. el doble montaje del modo desarrollo)

  // Con número configurado: se abre el chat una sola vez al llegar desde el carrito (el enlace sigue disponible).
  useEffect(() => {
    if (!autoOpen || !waUrl || opened.current) return;
    opened.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("abrir");
    window.history.replaceState(null, "", url.pathname + url.search);
    window.location.assign(waUrl);
  }, [autoOpen, waUrl]);

  async function copy(value: string, w: "msg" | "full") {
    setWhich(w);
    try {
      await navigator.clipboard.writeText(value);
      setCopied("ok");
    } catch {
      setCopied("manual");
      setTimeout(() => {
        area.current?.focus();
        area.current?.select();
      }, 0);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {waUrl ? (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-center bg-emerald px-8 text-lg font-bold text-paper hover:bg-emerald-2" data-testid="abrir-whatsapp">
            Reabrir WhatsApp
          </a>
        ) : null}
        <button type="button" onClick={() => copy(summaryMode ? fullText : text, summaryMode ? "full" : "msg")} className="min-h-14 border border-ink bg-white px-6 font-bold hover:bg-gold" data-testid="copiar-mensaje">
          {summaryMode ? "Copiar detalle completo" : "Copiar mensaje"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-emerald" data-testid="copiado">
        {copied === "ok" && (which === "full" ? "Detalle copiado. Pegalo en el chat." : "Mensaje copiado.")}
        {copied === "manual" && "No pudimos copiar automáticamente: el texto quedó seleccionado, copialo con Ctrl+C."}
      </p>
      {copied === "manual" && (
        <textarea ref={area} readOnly value={which === "full" ? fullText : text} rows={8} aria-label="Mensaje para copiar" className="mt-2 w-full border border-ink/40 bg-white p-3 font-mono text-xs" />
      )}
    </div>
  );
}
