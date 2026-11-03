"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { parseMoney } from "@/lib/money-input";

export { parseMoney };

/**
 * Formulario genérico del panel: arma el cuerpo JSON, agrega UNA clave de operación por intento (un doble clic o un reintento tras un corte de red reutiliza la misma clave y
 * el servidor no duplica nada), conserva lo escrito si algo falla y avisa con claridad. Los importes se escriben en pesos y viajan en centavos; las fechas son fechas reales.
 */
export type FormField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "int" | "pesos" | "usd" | "date" | "select" | "checkbox";
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string | boolean;
  /** Solo se envía si tiene valor (campos opcionales). */
  optional?: boolean;
  maxLength?: number;
};

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

export const newKey = (): string => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(16).slice(2)}`).replace(/-/g, "").padEnd(24, "0");

/** Una fecha «AAAA-MM-DD» es el mediodía de Argentina de ese día (UTC-3). */
export const dateToMs = (ymd: string): number | null => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && Number.isFinite(Date.parse(`${ymd}T12:00:00-03:00`)) ? Date.parse(`${ymd}T12:00:00-03:00`) : null);
export const todayYmd = (): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export function AdminForm({ endpoint, method = "POST", fixed = {}, fields, submit, ok = "Guardado.", compact = false, confirmText, idempotent = true, testId }: {
  endpoint: string; method?: "POST" | "PATCH" | "PUT"; fixed?: Record<string, unknown>; fields: FormField[]; submit: string; ok?: string; compact?: boolean; confirmText?: string; idempotent?: boolean; testId?: string;
}) {
  const router = useRouter();
  const formId = useId();
  const init = () => Object.fromEntries(fields.map((f) => [f.name, f.defaultValue ?? (f.type === "checkbox" ? false : f.type === "date" ? todayYmd() : f.type === "select" && f.required ? (f.options?.[0]?.value ?? "") : "")]));
  const [values, setValues] = useState<Record<string, string | boolean>>(init);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (confirmText && !window.confirm(confirmText)) return;
    const body: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const raw = values[f.name];
      const t = f.type ?? "text";
      if (t === "checkbox") { body[f.name] = Boolean(raw); continue; }
      const text = String(raw ?? "").trim();
      if (!text) {
        if (f.required && !f.optional) { setMsg({ ok: false, text: `Completá «${f.label}».` }); return; }
        if (!f.optional) body[f.name] = null;
        continue;
      }
      if (t === "int") { const n = Number(text.replace(/\./g, "")); if (!Number.isInteger(n)) { setMsg({ ok: false, text: `«${f.label}» tiene que ser un número entero.` }); return; } body[f.name] = n; }
      else if (t === "pesos" || t === "usd") { const n = parseMoney(text); if (n === null) { setMsg({ ok: false, text: `«${f.label}» no es un importe válido.` }); return; } body[f.name] = n; }
      else if (t === "date") { const n = dateToMs(text); if (n === null) { setMsg({ ok: false, text: `«${f.label}» no es una fecha válida.` }); return; } body[f.name] = n; }
      else body[f.name] = text;
    }
    if (idempotent) body.idempotencyKey = key.current;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No se pudo guardar. Intentá de nuevo." }); return; }
      setMsg({ ok: true, text: data?.replayed ? "Ya estaba registrado: no se duplicó." : ok });
      key.current = newKey();
      setValues(init());
      router.refresh();
    } catch {
      // Sin red: el formulario conserva lo escrito y la MISMA clave, así reintentar es seguro.
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se guardó nada: lo que escribiste sigue acá, reintentá." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "flex flex-wrap items-end gap-3" : "grid gap-3 sm:grid-cols-2"} data-testid={testId}>
      {fields.map((f) => {
        const id = `${formId}-${f.name}`.replace(/[^a-z0-9-]/gi, "");
        const t = f.type ?? "text";
        return (
          <div key={f.name} className={t === "textarea" ? "sm:col-span-2" : ""}>
            {t === "checkbox" ? (
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))} className="h-5 w-5" />{f.label}</label>
            ) : (
              <>
                <label htmlFor={id} className={lbl}>{f.label}{f.required ? " *" : ""}</label>
                {t === "textarea" ? <textarea id={id} rows={3} maxLength={f.maxLength ?? 1000} value={String(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} placeholder={f.placeholder} className={`${field} py-2`} />
                  : t === "select" ? <select id={id} value={String(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} className={field}>{!f.required && <option value="">—</option>}{(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input id={id} type={t === "date" ? "date" : "text"} inputMode={t === "int" ? "numeric" : t === "pesos" || t === "usd" ? "decimal" : undefined} maxLength={f.maxLength ?? 200} value={String(values[f.name])} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} placeholder={f.placeholder ?? (t === "pesos" ? "$ 0" : t === "usd" ? "USD 0,00" : undefined)} className={field} />}
                {f.help && <p className="mt-1 text-xs text-ink/75">{f.help}</p>}
              </>
            )}
          </div>
        );
      })}
      <div className={compact ? "" : "sm:col-span-2"}>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Guardando…" : submit}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}

/** Botón de una sola acción (reintentar, anular, avisar…): misma clave por intento, confirmación opcional. */
export function AdminButton({ endpoint, body, label, ok = "Listo.", confirmText, method = "POST", danger = false }: { endpoint: string; body: Record<string, unknown>; label: string; ok?: string; confirmText?: string; method?: "POST" | "PATCH"; danger?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());
  async function run() {
    if (busy || (confirmText && !window.confirm(confirmText))) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, idempotencyKey: key.current }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No se pudo completar." }); return; }
      setMsg({ ok: true, text: ok });
      key.current = newKey();
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión con el servidor. No se hizo nada: reintentá." });
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={run} disabled={busy} className={`min-h-11 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${danger ? "border border-vermilion text-vermilion hover:bg-vermilion/10" : "border border-ink/40 hover:bg-paper"}`}>{busy ? "…" : label}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={`mt-1 text-xs font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</span>}
    </span>
  );
}
