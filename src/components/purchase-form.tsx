"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { formatUSD } from "@/features/fx/convert";
import { quoteAmount, quoteDecimal, usdFromRmb } from "@/lib/taobao-quote";
import { dateToMs, newKey, parseMoney, todayYmd } from "./admin-form";

type Opt = { value: string; label: string };
type ItemRow = { productId: string; search?: string; quantity: string; price: string };
type ExpRow = { kind: string; amount: string; allocation: string; manual: string[]; certainty: string; description: string };
type Draft = {
  id: string; supplier: string; purchasedAt: number; currency: string; rateToArs10k: number | null;
  rateNote: string | null; reference: string | null; note: string | null;
  rmbPerUsd10k: number | null; usdToArs10k: number | null; paidUsdMinor: number | null;
  items: Array<{ productId: string; quantity: number; unitPriceOriginalMinor: number }>;
  expenses: Array<{ kind: string; amountMinor: number | null; allocation: string; manualJson: string | null; certainty: string; description: string | null }>;
};
const dateString = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).format(ms);
const readMoney = (value: string) => /[-−]/.test(value) ? null : parseMoney(value);
const moneyText = (minor: number | null) => minor === null ? "" : String(minor / 100).replace(".", ",");
const rateText = (rate: number | null | undefined) => rate ? String(rate / 10_000).replace(".", ",") : "";
const emptyExpense = (kind = "envio", certainty = "definitivo"): ExpRow => ({ kind, amount: "", allocation: "unidades", manual: [], certainty, description: "" });

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const lbl = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";

/**
 * Alta de una compra o lote (solo panel): proveedor, moneda y cotización usada, artículos con su precio original y gastos compartidos, cada uno con su REGLA de reparto
 * (por unidades, por valor o manual). Queda en borrador; el costo final por unidad se calcula y congela al confirmarla.
 */
export function PurchaseForm({ products, draft, managed = false, supplierNames = [] }: { products: Opt[]; draft?: Draft; managed?: boolean; supplierNames?: string[] }) {
  const router = useRouter();
  const supplierList = useId();
  const productList = useId();
  const [rmbRate, setRmbRate] = useState(rateText(draft?.rmbPerUsd10k));
  const [usdRate, setUsdRate] = useState(rateText(draft?.usdToArs10k ?? (draft?.currency === "USD" ? draft.rateToArs10k : null)));
  const [paidUsd, setPaidUsd] = useState(moneyText(draft?.paidUsdMinor ?? null));
  const [autoRate, setAutoRate] = useState(!draft);
  const [quote, setQuote] = useState<{ loading: boolean; date?: string; missing?: boolean } | null>(null);
  const [quoteAttempt, setQuoteAttempt] = useState(draft ? 0 : 1);
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
    const rows = draft?.expenses.filter((e) => e.kind !== "comisiones_compra").map((e) => {
      const manual = JSON.parse(e.manualJson ?? "{}") as Record<string, number>;
      return { kind: e.kind, amount: moneyText(e.amountMinor), allocation: e.allocation, certainty: e.certainty, description: e.description ?? "", manual: draft.items.map((_, i) => moneyText(manual[i] ?? null)) };
    }) ?? [];
    return rows;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());

  const setItem = (i: number, patch: Partial<ItemRow>) => setItems((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const setExp = (i: number, patch: Partial<ExpRow>) => setExps((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  useEffect(() => {
    if (!managed || !quoteAttempt) return;
    let active = true;
    fetch("/api/admin/proveedores/cotizacion-rmb?compras=1", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json() as { rmb: { rate: number; date: string } | null; usdToArs10k: number | null };
        if (!active) return;
        if (data.rmb) setRmbRate((current) => quoteAttempt > 1 ? rateText(data.rmb?.rate) : current || rateText(data.rmb?.rate));
        if (data.usdToArs10k) setUsdRate((current) => quoteAttempt > 1 ? rateText(data.usdToArs10k) : current || rateText(data.usdToArs10k));
        setQuote({ loading: false, date: data.rmb?.date, missing: !data.rmb || !data.usdToArs10k });
      })
      .catch(() => { if (active) setQuote({ loading: false, missing: true }); });
    return () => { active = false; };
  }, [managed, quoteAttempt]);

  const rmbPerUsd10k = quoteDecimal(rmbRate, 4);
  const parseRate = (value: string) => /^\d+(?:[,.]\d{1,4})?$/.test(value.trim()) ? Math.round(Number(value.replace(",", ".")) * 10_000) : null;
  const usdToArs10k = parseRate(usdRate);
  const automaticRate = currency === "USD" ? usdRate : rmbPerUsd10k && usdToArs10k ? rateText(Math.round(usdToArs10k * 10_000 / rmbPerUsd10k)) : "";
  const appliedRate = managed && autoRate ? automaticRate : rate;
  const originalTotal = items.reduce((sum, item) => sum + (readMoney(item.price) ?? 0) * (/^\d+$/.test(item.quantity.trim()) ? Number(item.quantity) : 0), 0);
  const usdRateUsed = currency === "USD" ? parseRate(appliedRate) : usdToArs10k;
  const productUsd = currency === "USD" ? originalTotal : currency === "RMB" ? rmbPerUsd10k && usdFromRmb(originalTotal, rmbPerUsd10k)
    : usdRateUsed && Math.round(originalTotal * 10_000 / usdRateUsed);
  const paidUsdMinor = readMoney(paidUsd);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const purchasedAt = dateToMs(date);
    if (!supplier.trim() || purchasedAt === null) { setMsg({ ok: false, text: "Completá el proveedor y la fecha." }); return; }
    const rate10k = currency === "ARS" ? null : parseRate(appliedRate);
    if (managed && paidUsd.trim() && (!paidUsdMinor || !usdRateUsed || productUsd === null || paidUsdMinor < productUsd)) {
      setMsg({ ok: false, text: "Revisá las cotizaciones y el total en USD. El total pagado tiene que cubrir el valor de la mercadería." });
      return;
    }
    if (currency !== "ARS" && (rate10k === null || rate10k <= 0)) { setMsg({ ok: false, text: "Cargá la cotización usada (pesos por cada unidad de la moneda)." }); return; }
    const body = {
      supplier: supplier.trim(), purchasedAt, currency, rateToArs10k: rate10k,
      rateNote: rateNote.trim() || (managed && autoRate && quote?.date && currency === "RMB" ? `USD/RMB BCE del ${quote.date} · dólar del panel` : null), reference, note,
      ...(managed ? { rmbPerUsd10k, usdToArs10k: usdRateUsed, paidUsdMinor } : {}),
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
        <div className="sm:col-span-2">
          <label htmlFor="c-prov" className={lbl}>Proveedor</label>
          <input id="c-prov" value={supplier} onChange={(e) => setSupplier(e.target.value)} list={supplierNames.length ? supplierList : undefined} className={field} />
          {supplierNames.length > 0 && <datalist id={supplierList}>{supplierNames.map((name) => <option key={name} value={name} />)}</datalist>}
        </div>
        <div><label htmlFor="c-fecha" className={lbl}>Fecha de compra</label><input id="c-fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></div>
        <div><label htmlFor="c-mon" className={lbl}>Moneda del precio original</label><select id="c-mon" value={currency} onChange={(e) => { setCurrency(e.target.value); if (managed) setAutoRate(true); }} className={field}><option value="RMB">RMB</option><option value="USD">USD</option><option value="ARS">ARS</option></select></div>
        {currency !== "ARS" && <div><label htmlFor="c-cot" className={lbl}>Cotización usada ($ por {currency})</label><input id="c-cot" inputMode="decimal" value={appliedRate} onChange={(e) => { setRate(e.target.value); setAutoRate(false); }} placeholder="Ej.: 210" className={field} /></div>}
        {currency !== "ARS" && <div className="sm:col-span-3"><label htmlFor="c-cotnota" className={lbl}>De dónde sale la cotización (opcional)</label><input id="c-cotnota" value={rateNote} onChange={(e) => setRateNote(e.target.value)} className={field} /></div>}
      </div>

      {managed && <div className="rounded-lg bg-paper-2 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {currency === "RMB" && <label className={lbl}>Renminbi por USD<input inputMode="decimal" value={rmbRate} onChange={(e) => setRmbRate(e.target.value)} className={field} /></label>}
          {currency !== "USD" && <label className={lbl}>Pesos por USD<input inputMode="decimal" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} className={field} /></label>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/75">
          <button type="button" className="min-h-11 font-semibold underline" disabled={quote?.loading} onClick={() => {
            setAutoRate(true);
            setQuote({ loading: true });
            setQuoteAttempt((attempt) => Math.max(attempt + 1, 2));
          }}>Usar cotizaciones actuales</button>
          <span role="status">{quote?.loading || (!quote && !draft) ? "Buscando cotizaciones…" : quote?.missing ? "Falta una cotización automática. Podés completarla a mano." : quote?.date && currency === "RMB" ? `USD/RMB de referencia del BCE · ${quote.date}` : "Podés ajustar los valores según el cambio que usaste."}</span>
        </div>
      </div>}

      {managed && <div className="grid gap-3 sm:grid-cols-2">
        <label className={lbl}>Referencia del proveedor<input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={field} /></label>
        <label className={lbl}>Notas internas<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={field} /></label>
      </div>}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Artículos ({currency}, precio unitario original)</legend>
        <datalist id={productList}>{products.map((p) => <option key={p.value} value={p.label}>{p.value}</option>)}</datalist>
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[3fr_1fr_1fr_auto]">
            <div><label htmlFor={`c-p-${i}`} className="sr-only">Producto {i + 1}</label><input id={`c-p-${i}`} type="search" list={productList} autoComplete="off" placeholder="Escribí un nombre o SKU" value={it.search ?? products.find((p) => p.value === it.productId)?.label ?? ""} onChange={(e) => {
              const search = e.target.value;
              const match = products.find((p) => p.label === search || p.value === search);
              setItem(i, { search: match?.label ?? search, productId: match?.value ?? "" });
            }} className={field} /></div>
            <div><label htmlFor={`c-q-${i}`} className="sr-only">Cantidad {i + 1}</label><input id={`c-q-${i}`} inputMode="numeric" placeholder="Cantidad" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} className={field} /></div>
            <div><label htmlFor={`c-pr-${i}`} className="sr-only">Precio unitario {i + 1}</label><input id={`c-pr-${i}`} inputMode="decimal" placeholder={`Precio (${currency})`} value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} className={field} /></div>
            <button type="button" disabled={items.length <= 1} onClick={() => {
              setItems((a) => a.filter((_, k) => k !== i));
              setExps((a) => a.map((x) => ({ ...x, manual: items.map((_, k) => x.manual[k] ?? "").filter((_, k) => k !== i) })));
            }} className="min-h-11 rounded-lg border border-ink/30 px-3 text-sm disabled:opacity-50" aria-label={`Quitar artículo ${i + 1}`}>Quitar</button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((a) => [...a, { productId: "", quantity: "", price: "" }])} className="min-h-11 rounded-lg border border-ink/40 px-4 text-sm font-semibold">+ Agregar artículo</button>
      </fieldset>

      {managed && <div className="space-y-2 rounded-lg bg-paper-2 p-3">
        <p className="text-sm">Mercadería <b>{currency === "ARS" ? new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(originalTotal / 100) : quoteAmount(originalTotal, currency === "RMB" ? "RMB" : "USD")}</b>{currency !== "USD" && productUsd !== null && ` · ${formatUSD(productUsd)}`}</p>
        <label className={lbl}>Total pagado al agente o plataforma (USD, opcional)<input inputMode="decimal" value={paidUsd} onChange={(e) => setPaidUsd(e.target.value)} className={field} /></label>
        <p className="text-xs text-ink/75">Incluí la mercadería y el cargo del agente o la plataforma. Cargá el envío internacional y la aduana por separado.</p>
        {paidUsdMinor !== null && productUsd !== null && paidUsdMinor >= productUsd && <p className="text-sm" aria-live="polite">Diferencia por comisiones <b>{formatUSD(paidUsdMinor - productUsd)}</b> · se reparte según el valor de cada artículo.</p>}
      </div>}

      <details className="space-y-2">
        <summary className="cursor-pointer text-sm font-semibold">Otros gastos de esta compra</summary>
        {managed && <p className="text-xs text-ink/70">El envío internacional y la aduana del lote se cargan en Despachos.</p>}
        <fieldset className="space-y-2">
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
      </details>

      <div>
        <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Guardando…" : "Guardar compra (borrador)"}</button>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm font-semibold ${msg.ok ? "text-emerald" : "text-vermilion"}`}>{msg.text}</p>}
      </div>
    </form>
  );
}
