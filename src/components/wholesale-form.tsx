"use client";

import { useState } from "react";
import { provinces } from "@/features/inquiries/schemas";
import type { WholesaleRequestView } from "@/features/wholesale/service";
import { WholesaleStatusCard } from "./wholesale-status";

const input = "h-12 w-full border border-ink/40 bg-white px-3 text-sm aria-[invalid=true]:border-vermilion aria-[invalid=true]:bg-vermilion/5";
const labelCls = "mb-1 block text-[.7rem] font-bold uppercase tracking-[.14em] text-ink/70";

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
      {error && <p id={`err-${id}`} role="alert" className="mt-1 text-sm font-semibold text-vermilion">{error}</p>}
    </div>
  );
}

/** Formulario de solicitud de cuenta mayorista (solo con sesión iniciada: el servidor toma el usuario de la sesión). */
export function WholesaleRequestForm({ userName }: { userName: string }) {
  const [businessName, setBusinessName] = useState("");
  const [locality, setLocality] = useState("");
  const [province, setProvince] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ request: WholesaleRequestView; replayed: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (businessName.trim().length < 2) er.businessName = "Contanos tu nombre comercial o actividad.";
    if (locality.trim().length < 2) er.locality = "Ingresá tu localidad.";
    if (!province) er.province = "Elegí una provincia.";
    if (note.length > 500) er.note = "La nota admite hasta 500 caracteres.";
    setErrors(er);
    setFormError("");
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mayoristas/solicitud", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, locality, province, note: note.trim() || undefined }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.request) {
        setSaved({ request: data.request as WholesaleRequestView, replayed: Boolean(data.replayed) });
        return;
      }
      if (res.status === 401) return setFormError("Tu sesión venció. Ingresá de nuevo para enviar la solicitud.");
      if (data?.error?.code === "invalid_input" && Array.isArray(data.error.details)) {
        const fe: Record<string, string> = {};
        for (const d of data.error.details as Array<{ path: string; message: string }>) fe[d.path] ??= d.message;
        setErrors(fe);
      }
      setFormError(data?.error?.message ?? "No pudimos guardar tu solicitud. Intentá de nuevo.");
    } catch {
      setFormError("No pudimos conectarnos. Tu solicitud no se guardó: revisá tu conexión e intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div data-testid="solicitud-guardada">
        {saved.replayed && <p role="note" className="mb-3 border-l-4 border-emerald bg-emerald/10 p-3 text-sm">Ya habías enviado una solicitud: no se creó otra.</p>}
        <WholesaleStatusCard request={saved.request} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" data-testid="form-mayorista">
      <p className="text-sm text-ink/75">Hola, {userName.split(" ")[0]}. Usamos el nombre y el correo de tu cuenta; solo falta lo siguiente.</p>
      <Field id="businessName" label="Nombre comercial o actividad" error={errors.businessName}>
        <input id="businessName" autoComplete="organization" maxLength={80} value={businessName} onChange={(e) => setBusinessName(e.target.value)} aria-invalid={Boolean(errors.businessName)} aria-describedby={errors.businessName ? "err-businessName" : undefined} className={input} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="locality" label="Localidad" error={errors.locality}>
          <input id="locality" autoComplete="address-level2" maxLength={80} value={locality} onChange={(e) => setLocality(e.target.value)} aria-invalid={Boolean(errors.locality)} aria-describedby={errors.locality ? "err-locality" : undefined} className={input} />
        </Field>
        <Field id="province" label="Provincia" error={errors.province}>
          <select id="province" autoComplete="address-level1" value={province} onChange={(e) => setProvince(e.target.value)} aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? "err-province" : undefined} className={input}>
            <option value="">Elegí una provincia</option>
            {provinces.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <Field id="note" label="Artículos o volumen de interés (opcional)" error={errors.note} hint="Por ejemplo, qué colecciones o formatos te interesan y qué cantidades manejás. No es un pedido ni una reserva.">
        <textarea id="note" maxLength={500} rows={4} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? "err-note" : undefined} className="w-full border border-ink/40 bg-white p-3 text-sm aria-[invalid=true]:border-vermilion" />
      </Field>
      {formError && <p role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">{formError}</p>}
      <button type="submit" disabled={busy} className="min-h-12 w-full bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Enviando…" : "Enviar solicitud"}</button>
      <p className="text-xs text-ink/65">Guardamos estos datos solo para evaluar tu solicitud. No pedimos documentos ni identificaciones. Enviarla no activa ningún descuento.</p>
    </form>
  );
}
