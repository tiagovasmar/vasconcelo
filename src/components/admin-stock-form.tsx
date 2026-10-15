"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export type StockProduct = { id: string; sku: string; title: string; stock: number | null };
const inputCls = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30";
const labelCls = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";
const newKey = () => crypto.randomUUID().replace(/-/g, "");

/** Entrada de mercadería (suma) o ajuste a lo realmente contado (fija el valor). Los dos piden motivo y quedan en el historial de movimientos. */
export function AdminStockForm({ products }: { products: StockProduct[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"entrada" | "ajuste">("entrada");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());
  const busyRef = useRef(false);
  const p = useMemo(() => products.find((x) => x.id === productId), [products, productId]);
  const n = /^\d{1,7}$/.test(amount.trim()) ? Number(amount.trim()) : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!p) return setMsg({ ok: false, text: "Elegí un producto." });
    if (n === null || (kind === "entrada" && n < 1)) return setMsg({ ok: false, text: kind === "entrada" ? "Escribí cuántas unidades entraron (1 o más)." : "Escribí la cantidad que hay realmente (0 o más)." });
    if (reason.trim().length < 3) return setMsg({ ok: false, text: "Escribí el motivo (mínimo 3 caracteres)." });
    busyRef.current = true; setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/admin/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "entrada" ? { kind, productId, quantity: n, reason: reason.trim(), idempotencyKey: key.current } : { kind, productId, newQuantity: n, reason: reason.trim(), idempotencyKey: key.current }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg({ ok: false, text: data?.error?.message ?? "No se pudo registrar el movimiento." });
      setMsg({ ok: true, text: `Listo: ${p.title} ${data.stockBefore === null ? "quedó en" : `pasó de ${data.stockBefore} a`} ${data.stockAfter} unidades.` });
      setAmount(""); setReason(""); key.current = newKey();
      router.refresh();
    } catch { setMsg({ ok: false, text: "No hay conexión con el servidor. Si no ves el movimiento en el historial, repetilo." }); } finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-ink/15 bg-white p-4" aria-label="Registrar entrada o ajuste de stock" data-testid="form-stock">
      <h2 className="text-lg font-semibold">Registrar entrada o ajuste</h2>
      <fieldset className="mt-3 flex flex-wrap gap-4">
        <legend className="sr-only">Tipo de movimiento</legend>
        {([["entrada", "Entrada de mercadería (suma)"], ["ajuste", "Ajuste a la cantidad contada (fija)"]] as const).map(([v, l]) => (
          <label key={v} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="tipo-mov" checked={kind === v} onChange={() => { setKind(v); setMsg(null); }} className="h-5 w-5 accent-[#0b4032]" data-testid={`tipo-${v}`} />{l}</label>
        ))}
      </fieldset>
      <div className="mt-2 grid gap-4 sm:grid-cols-[2fr_1fr]">
        <div>
          <label htmlFor="mov-producto" className={labelCls}>Producto</label>
          <select id="mov-producto" value={productId} onChange={(e) => { setProductId(e.target.value); setMsg(null); }} className={`${inputCls} mt-1`} data-testid="mov-producto">
            <option value="">Elegí un producto</option>
            {products.map((x) => <option key={x.id} value={x.id}>{x.title} · {x.sku} · stock {x.stock === null ? "pendiente" : x.stock}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="mov-cantidad" className={labelCls}>{kind === "entrada" ? "Unidades que entraron" : "Cantidad real"}</label>
          <input id="mov-cantidad" inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))} className={`${inputCls} mt-1`} data-testid="mov-cantidad" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="mov-motivo" className={labelCls}>Motivo</label>
          <input id="mov-motivo" maxLength={200} autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "entrada" ? "Ej.: compra al proveedor, reposición" : "Ej.: conteo físico, producto dañado"} className={`${inputCls} mt-1`} data-testid="mov-motivo" />
        </div>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-12 rounded-lg bg-emerald px-6 text-base font-semibold text-paper hover:bg-emerald-2 disabled:opacity-50" data-testid="mov-guardar">{busy ? "Guardando…" : kind === "entrada" ? "Registrar entrada" : "Registrar ajuste"}</button>
      <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-sm font-semibold ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : ""}`} data-testid="mov-mensaje">{msg?.text}</p>
    </form>
  );
}
