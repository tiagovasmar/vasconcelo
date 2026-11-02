"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { dateToMs, newKey, parseMoney, todayYmd } from "./admin-form";

type Opt = { value: string; label: string };
type ItemRow = { productId: string; quantity: string; price: string };
type ExpRow = { kind: string; amount: string; allocation: string; manual: string[] };

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

/**
 * Alta de una compra o lote (solo panel): proveedor, moneda y cotización usada, artículos con su precio original y gastos compartidos, cada uno con su REGLA de reparto
 * (por unidades, por valor o manual). Queda en borrador; el costo final por unidad se calcula y congela al confirmarla.
 */
export function PurchaseForm({ products }: { products: Opt[] }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [currency, setCurrency] = useState("RMB");
  const [rate, setRate] = useState("");
  const [rateNote, setRateNote] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ productId: "", quantity: "", price: "" }]);
  const [exps, setExps] = useState<ExpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());

  const setItem = (i: number, patch: Partial<ItemRow>) => setItems((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const setExp = (i: number, patch: Partial<ExpRow>) => setExps((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const purchasedAt = dateToMs(date);
    if (!supplier.trim() || purchasedAt === null) { setMsg({ ok: false, text: "Completá el proveedor y la fecha." }); return; }
    const rateMinor = currency === "ARS" ? null : parseMoney(rate);
    if (currency !== "ARS" && (rateMinor === null || rateMinor <= 0)) { setMsg({ ok: false, text: "Cargá la cotización usada (pesos por cada unidad de la moneda)." }); return; }
    const body = {
      supplier: supplier.trim(), purchasedAt, currency, rateToArs10k: rateMinor === null ? null : rateMinor * 100, rateNote: rateNote.trim() || null,
      items: items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity), unitPriceOriginalMinor: parseMoney(i.price) ?? NaN })),
      expenses: exps.map((x) => ({ kind: x.kind, amountMinor: parseMoney(x.amount) ?? NaN, allocation: x.allocation, manual: x.allocation === "manual" ? Object.fromEntries(x.manual.map((m, k) => [String(k), parseMoney(m) ?? 0])) : null })),
      idempotencyKey: key.current,
    };
    if (body.items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity < 1 || !Number.isFinite(i.unitPriceOriginalMinor))) { setMsg({ ok: false, text: "Revisá los artículos: producto, cantidad entera y precio." }); return; }
    if (body.expenses.some((x) => !Number.isFinite(x.amountMinor))) { setMsg({ ok: false, text: "Revisá el importe de los gastos." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/costos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_purchase", ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No se pudo guardar la compra." }); return; }
      setMsg({ ok: true, text: data.replayed ? "Esa compra ya estaba cargada." : "Compra guardada en borrador. Revisala y confirmala para calcular los costos." });
      key.current = newKey();
      setSupplier(""); setItems([{ productId: "", quantity: "", price: "" }]); setExps([]); setRate(""); setRateNote("");
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "No hay conexión. No se guardó nada: lo que cargaste sigue acá, reintentá." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="form-compra">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><label htmlFor="c-prov" className={lbl}>Proveedor</label><input id="c-prov" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={field} /></div>
        <div><label htmlFor="c-fecha" className={lbl}>Fecha de compra</label><input id="c-fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></div>
        <div><label htmlFor="c-mon" className={lbl}>Moneda del precio original</label><select id="c-mon" value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}><option value="RMB">RMB</option><option value="USD">USD</option><option value="ARS">ARS</option></select></div>
        {currency !== "ARS" && <div><label htmlFor="c-cot" className={lbl}>Cotización usada ($ por {currency})</label><input id="c-cot" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ej.: 210" className={field} /></div>}
        {currency !== "ARS" && <div className="sm:col-span-3"><label htmlFor="c-cotnota" className={lbl}>De dónde sale la cotización (opcional)</label><input id="c-cotnota" value={rateNote} onChange={(e) => setRateNote(e.target.value)} className={field} /></div>}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Artículos ({currency}, precio unitario original)</legend>
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_auto]">
            <div><label htmlFor={`c-p-${i}`} className="sr-only">Producto {i + 1}</label><select id={`c-p-${i}`} value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })} className={field}><option value="">Elegí un producto…</option>{products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label htmlFor={`c-q-${i}`} className="sr-only">Cantidad {i + 1}</label><input id={`c-q-${i}`} inputMode="numeric" placeholder="Cantidad" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value.replace(/\D/g, "") })} className={field} /></div>
            <div><label htmlFor={`c-pr-${i}`} className="sr-only">Precio unitario {i + 1}</label><input id={`c-pr-${i}`} inputMode="decimal" placeholder={`Precio (${currency})`} value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} className={field} /></div>
            <button type="button" onClick={() => setItems((a) => (a.length > 1 ? a.filter((_, k) => k !== i) : a))} className="min-h-11 rounded-lg border border-ink/30 px-3 text-sm" aria-label={`Quitar artículo ${i + 1}`}>Quitar</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((a) => [...a, { productId: "", quantity: "", price: "" }])} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-semibold">+ Agregar artículo</button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Gastos compartidos (en pesos) y cómo se reparten</legend>
        <p className="text-xs text-ink/70">Cada gasto se reparte entre los artículos con la regla que elijas; el reparto queda guardado fila por fila y suma exactamente el gasto. Nada se reparte en silencio.</p>
        {exps.map((x, i) => (
          <div key={i} className="rounded-lg bg-paper-2 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <div><label htmlFor={`g-k-${i}`} className="sr-only">Tipo de gasto {i + 1}</label><select id={`g-k-${i}`} value={x.kind} onChange={(e) => setExp(i, { kind: e.target.value })} className={field}><option value="envio">Envío</option><option value="impuestos">Impuestos</option><option value="otros">Otros</option></select></div>
              <div><label htmlFor={`g-a-${i}`} className="sr-only">Importe del gasto {i + 1}</label><input id={`g-a-${i}`} inputMode="decimal" placeholder="Importe ($)" value={x.amount} onChange={(e) => setExp(i, { amount: e.target.value })} className={field} /></div>
              <div><label htmlFor={`g-r-${i}`} className="sr-only">Regla de reparto {i + 1}</label><select id={`g-r-${i}`} value={x.allocation} onChange={(e) => setExp(i, { allocation: e.target.value, manual: items.map(() => "") })} className={field}><option value="unidades">Por unidades</option><option value="valor">Por valor</option><option value="manual">Manual</option></select></div>
              <button type="button" onClick={() => setExps((a) => a.filter((_, k) => k !== i))} className="min-h-11 rounded-lg border border-ink/30 px-3 text-sm" aria-label={`Quitar gasto ${i + 1}`}>Quitar</button>
            </div>
            {x.allocation === "manual" && <div className="mt-2 grid gap-2 sm:grid-cols-3">{items.map((it, k) => <div key={k}><label htmlFor={`g-m-${i}-${k}`} className="block text-xs">Para el artículo {k + 1}{it.productId ? ` (${products.find((p) => p.value === it.productId)?.label ?? ""})` : ""}</label><input id={`g-m-${i}-${k}`} inputMode="decimal" value={x.manual[k] ?? ""} onChange={(e) => setExp(i, { manual: items.map((_, q) => (q === k ? e.target.value : x.manual[q] ?? "")) })} className={field} /></div>)}</div>}
          </div>
        ))}
        <button type="button" onClick={() => setExps((a) => [...a, { kind: "envio", amount: "", allocation: "unidades", manual: items.map(() => "") }])} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-semibold">+ Agregar gasto</button>
      </fieldset>

      <div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Guardando…" : "Guardar compra (borrador)"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
