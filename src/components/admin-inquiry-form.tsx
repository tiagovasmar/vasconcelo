"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { paymentMethods } from "@/content/checkout-options";
import { isFullName, normalizeName } from "@/features/inquiries/delivery";
import { formatARS } from "@/lib/format";

/**
 * Carga de una consulta que llegó por otro medio (WhatsApp directo, redes, en persona). No reserva ni descuenta stock: solo deja el registro para gestionarlo
 * y, si se concreta, convertirlo en venta. La clave de operación se genera una vez y se reutiliza en cada reintento: un doble clic no crea dos consultas.
 */
export type ManualProduct = { id: string; sku: string; title: string; language: string; stock: number | null; priceMinor: number | null; orderOnly: boolean };
type Row = { productId: string; quantity: string; price: string; fulfillment: "stock" | "encargo" };

const CHANNELS: Array<[string, string]> = [["whatsapp", "WhatsApp directo"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["telefono", "Llamada"], ["presencial", "En persona"], ["otro", "Otro medio"]];
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const newKey = () => crypto.randomUUID().replace(/-/g, "");
const todayAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
/** Hoy → sin fecha (el servidor usa «ahora»); otro día → mediodía de Argentina (UTC-3). */
const dateToMs = (ymd: string): number | null => (!ymd || ymd === todayAR() ? null : Date.parse(`${ymd}T12:00:00-03:00`));
const pesos = (s: string) => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null);
const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

export function AdminInquiryForm({ products }: { products: ManualProduct[] }) {
  const router = useRouter();
  const key = useRef(newKey());
  const submitting = useRef(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState("whatsapp");
  const [date, setDate] = useState(todayAR());
  const [payment, setPayment] = useState("efectivo");
  const [delivery, setDelivery] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const matches = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return products.filter((p) => !rows.some((r) => r.productId === p.id) && terms.every((t) => norm(`${p.title} ${p.sku} ${p.id}`).includes(t))).slice(0, 8);
  }, [q, products, rows]);

  const parsed = rows.map((r) => ({ ...r, qty: /^\d{1,3}$/.test(r.quantity.trim()) ? Number(r.quantity.trim()) : null, unit: r.fulfillment === "encargo" && r.price.trim() === "" ? 0 : pesos(r.price) }));
  const problems: string[] = [];
  if (!isFullName(name)) problems.push("Escribí nombre y apellido.");
  if (!rows.length) problems.push("Agregá al menos un producto.");
  if (parsed.some((r) => !r.qty || r.qty < 1 || r.unit === null)) problems.push("Revisá cantidades y precios (números enteros).");
  const subtotal = parsed.reduce((n, r) => (r.fulfillment === "encargo" || !r.qty || r.unit === null ? n : n + r.qty * r.unit * 100), 0);
  const patch = (id: string, v: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.productId === id ? { ...r, ...v } : r))); setError(""); key.current = newKey(); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || done) return;
    if (problems.length) { setError(problems[0]); return; }
    submitting.current = true; setBusy(true); setError("");
    const body = {
      idempotencyKey: key.current, customerName: normalizeName(name), customerPhone: phone.trim() || null, channel, receivedAt: dateToMs(date), paymentMethod: payment,
      deliveryLabel: delivery.trim(), note: note.trim() || null,
      lines: parsed.map((r) => ({ productId: r.productId, quantity: r.qty!, fulfillment: r.fulfillment, unitPriceMinor: (r.unit ?? 0) * 100 })),
    };
    try {
      const res = await fetch("/api/admin/consultas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out?.error?.message ?? "No se pudo guardar la consulta."); return; }
      setDone(true);
      router.push(`/admin/consultas/${out.id}`);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor. No se guardó nada: podés reintentar sin riesgo de duplicar.");
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6" data-testid="form-consulta-manual" aria-label="Cargar consulta">
      <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Persona</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="m-nombre" className={lbl}>Nombre y apellido</label><input id="m-nombre" value={name} onChange={(e) => { setName(e.target.value); key.current = newKey(); }} maxLength={60} autoComplete="off" className={field} data-testid="m-nombre" /></div>
          <div><label htmlFor="m-tel" className={lbl}>Teléfono (opcional)</label><input id="m-tel" value={phone} onChange={(e) => { setPhone(e.target.value); key.current = newKey(); }} maxLength={20} inputMode="tel" autoComplete="off" className={field} data-testid="m-tel" /></div>
          <div><label htmlFor="m-medio" className={lbl}>¿Por dónde llegó?</label><select id="m-medio" value={channel} onChange={(e) => setChannel(e.target.value)} className={field} data-testid="m-medio">{CHANNELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label htmlFor="m-fecha" className={lbl}>Fecha de la consulta</label><input id="m-fecha" type="date" value={date} max={todayAR()} onChange={(e) => setDate(e.target.value)} className={field} data-testid="m-fecha" /></div>
          <div><label htmlFor="m-pago" className={lbl}>Método de pago</label><select id="m-pago" value={payment} onChange={(e) => setPayment(e.target.value)} className={field} data-testid="m-pago">{paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
          <div><label htmlFor="m-entrega" className={lbl}>Entrega (opcional)</label><input id="m-entrega" value={delivery} onChange={(e) => setDelivery(e.target.value)} maxLength={200} placeholder="Ej.: retiro" className={field} data-testid="m-entrega" /></div>
        </div>
      </section>

      <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
        <h2 className="text-base font-semibold">Productos</h2>
        <p className="mt-1 text-xs text-ink/70">Precios cotizados a la persona. Una consulta no reserva ni descuenta stock. «Por encargo» no sale de tu stock.</p>
        <div className="mt-3">
          <label htmlFor="m-buscar" className={lbl}>Agregar producto (nombre, colección o SKU)</label>
          <input id="m-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" className={`${field} mt-1`} data-testid="m-buscar" />
          {q.trim() && (
            <ul className="mt-2 divide-y divide-ink/10 rounded-lg border border-ink/15 bg-white" aria-label="Resultados" data-testid="m-resultados">
              {matches.length === 0 && <li className="px-3 py-3 text-sm text-ink/70">Ningún producto coincide (o ya está agregado).</li>}
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => { setRows((rs) => [...rs, { productId: p.id, quantity: "1", price: p.priceMinor ? String(Math.round(p.priceMinor / 100)) : "", fulfillment: p.orderOnly || !p.stock ? "encargo" : "stock" }]); setQ(""); key.current = newKey(); }} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gold/30" data-testid={`m-agregar-${p.id}`}>
                    <span className="min-w-0"><b className="block truncate">{p.title}</b><span className="font-mono text-xs text-ink/60">{p.sku}</span></span>
                    <span className="shrink-0 text-xs text-ink/70">{p.orderOnly ? "por encargo" : p.stock === null ? "stock pendiente" : `stock ${p.stock}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {rows.length === 0 ? <p className="mt-3 rounded-lg border border-dashed border-ink/40 p-4 text-center text-sm text-ink/70">Todavía no hay productos.</p> : (
          <ul className="mt-3 space-y-3">
            {parsed.map((r) => {
              const p = byId.get(r.productId)!;
              return (
                <li key={r.productId} className="rounded-lg border border-ink/15 p-3" data-testid={`m-linea-${r.productId}`}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-sm font-semibold">{p.title} <span className="font-normal text-ink/60">· <span className="font-mono">{p.sku}</span></span></p>
                    <button type="button" onClick={() => { setRows((rs) => rs.filter((x) => x.productId !== r.productId)); key.current = newKey(); }} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline hover:text-vermilion" aria-label={`Quitar ${p.title}`}>Quitar</button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div><label className={lbl} htmlFor={`mq-${r.productId}`}>Cantidad</label><input id={`mq-${r.productId}`} inputMode="numeric" value={r.quantity} onChange={(e) => patch(r.productId, { quantity: e.target.value.replace(/\D/g, "").slice(0, 3) })} className={field} data-testid={`m-cant-${r.productId}`} /></div>
                    <div><label className={lbl} htmlFor={`mp-${r.productId}`}>Precio c/u ($)</label><input id={`mp-${r.productId}`} inputMode="numeric" value={r.price} onChange={(e) => patch(r.productId, { price: e.target.value.replace(/\D/g, "").slice(0, 9) })} className={field} data-testid={`m-precio-${r.productId}`} /></div>
                    <div className="col-span-2"><label className={lbl} htmlFor={`mf-${r.productId}`}>Sale…</label>
                      <select id={`mf-${r.productId}`} value={r.fulfillment} onChange={(e) => patch(r.productId, { fulfillment: e.target.value as "stock" | "encargo" })} className={field} data-testid={`m-origen-${r.productId}`}><option value="stock">Del stock propio</option><option value="encargo">Por encargo</option></select></div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm font-semibold" data-testid="m-subtotal">Subtotal cotizado (sin los productos por encargo): {formatARS(subtotal)}</p>
      </section>

      <section className="rounded-xl border border-ink/15 bg-white p-4 sm:p-5">
        <label htmlFor="m-nota" className={lbl}>Nota interna (opcional)</label>
        <textarea id="m-nota" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-1 block w-full rounded-md border border-ink/40 bg-white px-3 py-2 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30" data-testid="m-nota" />
      </section>

      <p role="alert" aria-live="assertive" className="min-h-5 text-sm font-semibold text-vermilion" data-testid="m-error">{error}</p>
      {problems.length > 0 && !error && <p className="text-xs text-ink/70" data-testid="m-pendientes">Para guardar: {problems.join(" ")}</p>}
      <button type="submit" disabled={busy || done || problems.length > 0} className="min-h-12 rounded-lg bg-emerald px-6 text-base font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50" data-testid="m-guardar">{busy ? "Guardando…" : "Guardar consulta"}</button>
    </form>
  );
}
