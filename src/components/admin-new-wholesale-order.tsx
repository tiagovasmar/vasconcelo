"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { newKey, parseMoney } from "./admin-form";

type Product = { id: string; title: string; sku: string };
const input = "mt-1 block min-h-11 w-full min-w-0 rounded-md border border-ink/40 bg-white px-3 text-base";
const normalize = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function NewWholesaleOrder({ products, rate }: { products: Product[]; rate: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Array<{ product: Product; quantity: string }>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const matches = terms.length ? products.filter((p) => !lines.some((l) => l.product.id === p.id) && terms.every((term) => normalize(`${p.title} ${p.sku}`).includes(term))).slice(0, 8) : [];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const fields = new FormData(event.currentTarget);
    const field = (name: string) => String(fields.get(name) ?? "").trim();
    const amountUsdMinor = parseMoney(field("amount"));
    const rateMinor = parseMoney(field("rate"));
    if ((field("amount") && !amountUsdMinor) || (field("rate") && !rateMinor)) return setError("Revisá el importe en USD y la cotización.");
    if (!lines.length || lines.some((line) => !/^\d{1,3}$/.test(line.quantity) || Number(line.quantity) === 0)) return setError("Agregá productos con cantidades de 1 a 999.");
    const data = { contactName: field("name"), contactPhone: field("phone") || null, note: field("note") || null, amountUsdMinor, rateMinor, lines: lines.map((l) => ({ productId: l.product.id, quantity: Number(l.quantity) })) };
    const payload = JSON.stringify(data);
    if (attempt.current?.payload !== payload) attempt.current = { payload, key: newKey() };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/pedidos/mayoristas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, idempotencyKey: attempt.current.key }) });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message ?? "No se pudo guardar el pedido.");
        pending.current = false;
        setBusy(false);
        return;
      }
      router.push(`/admin/pedidos/${result.reference}`);
    } catch {
      setError("No se pudo confirmar el guardado. Volvé a intentar con los mismos datos.");
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-5" aria-label="Cargar pedido mayorista">
      <fieldset disabled={busy} className="grid min-w-0 gap-4 rounded-xl border border-ink/15 bg-white p-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Cliente o comercio<input name="name" required minLength={2} maxLength={100} className={input} /></label>
        <label className="text-sm font-semibold">Teléfono / WhatsApp<input name="phone" type="tel" maxLength={24} className={input} /></label>
        <label className="text-sm font-semibold">Total acordado en USD (opcional)<input name="amount" inputMode="decimal" className={input} /></label>
        <label className="text-sm font-semibold">Cotización (ARS por USD)<input name="rate" inputMode="decimal" defaultValue={rate} className={input} /></label>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold">Buscar producto por nombre o SKU<input type="search" className={input} value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          {terms.length > 0 && <ul className="mt-2 divide-y divide-ink/10 rounded-md border border-ink/15">
            {matches.map((p) => <li key={p.id}><button type="button" className="min-h-11 w-full px-3 text-left text-sm hover:bg-paper-2" onClick={() => { setLines((current) => [...current, { product: p, quantity: "1" }]); setQuery(""); }}>{p.title} · {p.sku}</button></li>)}
            {!matches.length && <li className="p-3 text-sm">No encontramos productos disponibles para agregar.</li>}
          </ul>}
          <ul className="mt-3 space-y-2">
            {lines.map(({ product, quantity }) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/15 p-3">
              <span className="min-w-0 flex-1 basis-48 text-sm font-semibold">{product.title}</span>
              <label className="w-24 text-xs font-semibold">Cantidad<input type="number" min={1} max={999} required value={quantity} className={input} onChange={(e) => {
                const next = e.target.value;
                setLines((current) => current.map((line) => line.product.id === product.id ? { ...line, quantity: next } : line));
              }} /></label>
              <button type="button" className="min-h-11 px-2 text-sm underline" aria-label={`Quitar ${product.title}`} onClick={() => setLines((current) => current.filter((line) => line.product.id !== product.id))}>Quitar</button>
            </li>)}
          </ul>
        </div>
        <label className="text-sm font-semibold sm:col-span-2">Nota interna (opcional)<textarea name="note" maxLength={500} rows={2} className={`${input} py-2`} /></label>
        <button className="min-h-11 justify-self-start rounded-md bg-ink px-4 text-sm font-semibold text-paper">{busy ? "Guardando…" : "Crear pedido"}</button>
      </fieldset>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-vermilion">{error}</p>}
    </form>
  );
}
