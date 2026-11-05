"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { dateToMs, newKey, parseMoney, todayYmd } from "./admin-form";

type Opt = { value: string; label: string };
type ItemRow = { productId: string; quantity: string; price: string };
type ExpRow = { kind: string; amount: string; allocation: string; manual: string[]; certainty: string; description: string };
type Draft = {
  id: string; supplier: string; purchasedAt: number; currency: string; rateToArs10k: number | null;
  rateNote: string | null; reference: string | null; note: string | null;
  items: Array<{ productId: string; quantity: number; unitPriceOriginalMinor: number }>;
  expenses: Array<{ kind: string; amountMinor: number | null; allocation: string; manualJson: string | null; certainty: string; description: string | null }>;
};
const dateString = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(ms);
const readMoney = (value: string) => /[-−]/.test(value) ? null : parseMoney(value);
const moneyText = (minor: number | null) => minor === null ? "" : String(minor / 100).replace(".", ",");
const emptyExpense = (kind = "envio", certainty = "definitivo"): ExpRow => ({ kind, amount: "", allocation: "unidades", manual: [], certainty, description: "" });

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

/**
 * Alta de una compra o lote (solo panel): proveedor, moneda y cotización usada, artículos con su precio original y gastos compartidos, cada uno con su REGLA de reparto
 * (por unidades, por valor o manual). Queda en borrador; el costo final por unidad se calcula y congela al confirmarla.
 */
export function PurchaseForm({ products, draft, managed = false }: { products: Opt[]; draft?: Draft; managed?: boolean }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState(draft?.supplier ?? "");
  const [date, setDate] = useState(draft ? dateString(draft.purchasedAt) : todayYmd());
  const [currency, setCurrency] = useState(draft?.currency ?? "RMB");
  const [rate, setRate] = useState(draft?.rateToArs10k ? String(draft.rateToArs10k / 10_000).replace(".", ",") : "");
  const [rateNote, setRateNote] = useState(draft?.rateNote ?? "");
  const [reference, setReference] = useState(draft?.reference ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const [items, setItems] = useState<ItemRow[]>(draft?.items.map((i) => ({ productId: i.productId, quantity: String(i.quantity), price: moneyText(i.unitPriceOriginalMinor) })) ?? [{ productId: "", quantity: "", price: "" }]);
  const [exps, setExps] = useState<ExpRow[]>(() => {
    if (!managed) return [];
    const rows = draft?.expenses.map((e) => {
      const manual = JSON.parse(e.manualJson ?? "{}") as Record<string, number>;
      return { kind: e.kind, amount: moneyText(e.amountMinor), allocation: e.allocation, certainty: e.certainty, description: e.description ?? "", manual: draft.items.map((_, i) => moneyText(manual[i] ?? null)) };
    }) ?? [];
    for (const kind of ["envio", "impuestos"]) if (!rows.some((r) => r.kind === kind)) rows.push(emptyExpense(kind, "pendiente"));
    return rows;
  });
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
    const rate10k = currency === "ARS" ? null : /^\d+(?:[,.]\d{1,4})?$/.test(rate.trim()) ? Math.round(Number(rate.replace(",", ".")) * 10_000) : null;
    if (currency !== "ARS" && (rate10k === null || rate10k <= 0)) { setMsg({ ok: false, text: "Cargá la cotización usada (pesos por cada unidad de la moneda)." }); return; }
    const body = {
      supplier: supplier.trim(), purchasedAt, currency, rateToArs10k: rate10k, rateNote: rateNote.trim() || null, reference, note,
      items: items.map((i) => ({ productId: i.productId, quantity: /^\d+$/.test(i.quantity.trim()) ? Number(i.quantity) : NaN, unitPriceOriginalMinor: readMoney(i.price) ?? NaN })),
      expenses: exps.map((x) => ({ kind: x.kind, amountMinor: x.certainty === "pendiente" ? null : readMoney(x.amount) ?? NaN, description: x.description, certainty: x.certainty, allocation: x.allocation, manual: x.allocation === "manual" ? Object.fromEntries(x.manual.map((m, k) => [String(k), m.trim() ? readMoney(m) ?? NaN : 0])) : null })),
      idempotencyKey: key.current,
    };
    if (body.items.some((i) => !i.productId || !Number.isInteger(i.quantity) || i.quantity < 1 || !Number.isFinite(i.unitPriceOriginalMinor))) { setMsg({ ok: false, text: "Revisá los artículos: producto, cantidad entera y precio." }); return; }
    if (body.expenses.some((x) => x.certainty !== "pendiente" && (!Number.isFinite(x.amountMinor) || Object.values(x.manual ?? {}).some((m) => !Number.isFinite(m))))) { setMsg({ ok: false, text: "Revisá el importe de los gastos." }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(managed ? "/api/admin/compras" : "/api/admin/costos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: managed ? draft ? "edit" : "create" : "create_purchase", purchaseId: draft?.id, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: data?.error?.message ?? "No se pudo guardar la compra." }); return; }
      setMsg({ ok: true, text: data.replayed ? "Esa compra ya estaba cargada." : "Compra guardada en borrador. Revisala y confirmala para calcular los costos." });
      key.current = newKey();
      if (managed) {
        if (draft) router.refresh();
        else router.push(`/admin/compras/${data.id}`);
        return;
      }
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

      {managed && <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Referencia del proveedor<input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={field} /></label>
        <label className={lbl}>Notas internas<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={field} /></label>
      </div>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Artículos ({currency}, precio unitario original)</legend>
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_auto]">
            <div><label htmlFor={`c-p-${i}`} className="sr-only">Producto {i + 1}</label><select id={`c-p-${i}`} value={it.productId} onChange={(e) => setItem(i, { productId: e.target.value })} className={field}><option value="">Elegí un producto…</option>{products.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label htmlFor={`c-q-${i}`} className="sr-only">Cantidad {i + 1}</label><input id={`c-q-${i}`} inputMode="numeric" placeholder="Cantidad" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} className={field} /></div>
            <div><label htmlFor={`c-pr-${i}`} className="sr-only">Precio unitario {i + 1}</label><input id={`c-pr-${i}`} inputMode="decimal" placeholder={`Precio (${currency})`} value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} className={field} /></div>
            <button type="button" onClick={() => {
              if (items.length <= 1) return;
              setItems((a) => a.filter((_, k) => k !== i));
              setExps((a) => a.map((x) => ({ ...x, manual: items.map((_, k) => x.manual[k] ?? "").filter((_, k) => k !== i) })));
            }} className="min-h-11 rounded-lg border border-ink/30 px-3 text-sm" aria-label={`Quitar artículo ${i + 1}`}>Quitar</button>
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
              <div><label htmlFor={`g-k-${i}`} className="sr-only">Tipo de gasto {i + 1}</label><select id={`g-k-${i}`} value={x.kind} onChange={(e) => setExp(i, { kind: e.target.value })} className={field}><option value="envio">Envío</option><option value="impuestos">Aduana e impuestos</option><option value="otros">Otros</option></select></div>
              <div><label htmlFor={`g-a-${i}`} className="sr-only">Importe del gasto {i + 1}</label><input id={`g-a-${i}`} inputMode="decimal" disabled={x.certainty === "pendiente"} placeholder="Importe ($)" value={x.amount} onChange={(e) => setExp(i, { amount: e.target.value })} className={field} /></div>
              <div><label htmlFor={`g-r-${i}`} className="sr-only">Regla de reparto {i + 1}</label><select id={`g-r-${i}`} value={x.allocation} onChange={(e) => setExp(i, { allocation: e.target.value, manual: items.map(() => "") })} className={field}><option value="unidades">Por unidades</option><option value="valor">Por valor</option><option value="manual">Manual</option></select></div>
              <button type="button" onClick={() => setExps((a) => a.filter((_, k) => k !== i))} className="min-h-11 rounded-lg border border-ink/30 px-3 text-sm" aria-label={`Quitar gasto ${i + 1}`}>Quitar</button>
            </div>
            {managed && <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className={lbl}>Estado del gasto<select className={field} value={x.certainty} onChange={(e) => setExp(i, { certainty: e.target.value })}>
                <option value="pendiente">Pendiente</option><option value="estimado">Estimado</option><option value="definitivo">Definitivo</option>
              </select></label>
              <label className={lbl}>Concepto<input value={x.description} onChange={(e) => setExp(i, { description: e.target.value })} maxLength={120} className={field} /></label>
            </div>}
            {x.certainty !== "pendiente" && x.allocation === "manual" && <div className="mt-2 grid gap-2 sm:grid-cols-3">{items.map((it, k) => <div key={k}><label htmlFor={`g-m-${i}-${k}`} className="block text-xs">Para el artículo {k + 1}{it.productId ? ` (${products.find((p) => p.value === it.productId)?.label ?? ""})` : ""}</label><input id={`g-m-${i}-${k}`} inputMode="decimal" value={x.manual[k] ?? ""} onChange={(e) => setExp(i, { manual: items.map((_, q) => (q === k ? e.target.value : x.manual[q] ?? "")) })} className={field} /></div>)}</div>}
          </div>
        ))}
        <button type="button" onClick={() => setExps((a) => [...a, emptyExpense()])} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-semibold">+ Agregar gasto</button>
      </fieldset>

      <div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Guardando…" : "Guardar compra (borrador)"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
