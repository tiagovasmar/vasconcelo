"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { paymentMethods } from "@/content/checkout-options";
import { formatARS } from "@/lib/format";

export type SaleProduct = { id: string; sku: string; title: string; language: string; stock: number | null; priceMinor: number | null; low: boolean; orderOnly: boolean };
type Line = { productId: string; quantity: string; price: string };
type Preview = { lines: Array<{ productId: string; sku: string; title: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number; stockNow: number | null; stockAfter: number | null; problem: string | null }>; totalMinor: number; ok: boolean };

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const newKey = () => crypto.randomUUID().replace(/-/g, "");
const inputCls = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30 aria-[invalid=true]:border-vermilion";
const labelCls = "block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70";
const pesos = (s: string) => (/^\d{1,9}$/.test(s.trim()) ? Number(s.trim()) : null);

/**
 * Registro de una venta manual en tres pasos: armar → revisar el resumen y el stock resultante (lo calcula el servidor) → confirmar.
 * Confirmar usa una clave de operación fija para esa venta: un doble clic o un reintento tras un corte devuelven la misma venta en lugar de registrar otra.
 */
export function AdminSaleForm({ products }: { products: SaleProduct[] }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<string>("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [step, setStep] = useState<"armar" | "revisar" | "hecho">("armar");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; replayed: boolean; total: number } | null>(null);
  const key = useRef(newKey());
  const submitting = useRef(false);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matches = useMemo(() => {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return products.filter((p) => !lines.some((l) => l.productId === p.id) && terms.every((t) => norm(`${p.title} ${p.sku} ${p.id}`).includes(t))).slice(0, 8);
  }, [q, products, lines]);

  const parsed = lines.map((l) => ({ ...l, qty: /^\d{1,3}$/.test(l.quantity.trim()) ? Number(l.quantity.trim()) : null, pesos: pesos(l.price) }));
  const total = parsed.reduce((n, l) => n + (l.qty && l.pesos ? l.qty * l.pesos * 100 : 0), 0);
  const formOk = parsed.length > 0 && parsed.every((l) => l.qty && l.qty >= 1 && l.pesos && l.pesos >= 1) && Boolean(payment);
  const body = () => ({ items: parsed.map((l) => ({ productId: l.productId, quantity: l.qty, unitPriceMinor: (l.pesos ?? 0) * 100 })), paymentMethod: payment, note: note.trim() || undefined, idempotencyKey: key.current });

  // Cualquier cambio de contenido es una venta distinta: clave de operación nueva (así no se confunde con un reintento de la anterior).
  const change = (fn: () => void) => { fn(); setError(""); setPreview(null); setStep("armar"); key.current = newKey(); };
  const add = (p: SaleProduct) => change(() => { setLines((ls) => [...ls, { productId: p.id, quantity: "1", price: p.priceMinor ? String(p.priceMinor / 100) : "" }]); setQ(""); });

  async function call(url: string) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body()) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function review() {
    if (!formOk) { setError(parsed.length === 0 ? "Elegí al menos un producto." : !payment ? "Elegí el método de pago." : "Completá cantidad y precio de cada producto (números enteros)."); return; }
    setBusy(true); setError("");
    try {
      const { res, data } = await call("/api/admin/ventas/previsualizar");
      if (!res.ok) { setError(data?.error?.message ?? "No se pudo preparar el resumen."); return; }
      setPreview(data.preview);
      setStep("revisar");
    } catch { setError("No hay conexión con el servidor. No se registró nada."); } finally { setBusy(false); }
  }

  async function confirm() {
    if (submitting.current) return; // un segundo clic mientras la primera operación sigue en curso no hace nada
    submitting.current = true; setBusy(true); setError("");
    try {
      const { res, data } = await call("/api/admin/ventas");
      if (!res.ok) { setError(data?.error?.message ?? "No se pudo registrar la venta."); if (res.status === 409) setStep("armar"); return; }
      setDone({ id: data.sale.id, replayed: Boolean(data.replayed), total: data.sale.totalMinor });
      setStep("hecho");
      router.refresh();
    } catch { setError("Se cortó la conexión. No sabemos si la venta se guardó: tocá «Confirmar venta» otra vez (si ya estaba guardada no se duplica) o revisá la lista de ventas."); } finally { submitting.current = false; setBusy(false); }
  }

  function reset() {
    setLines([]); setPayment(""); setNote(""); setQ(""); setPreview(null); setDone(null); setError(""); setStep("armar"); key.current = newKey();
  }

  if (step === "hecho" && done) {
    return (
      <div className="rounded-xl border border-emerald/40 bg-emerald/10 p-5" role="status" data-testid="venta-registrada">
        <p className="text-lg font-semibold">{done.replayed ? "Esa venta ya estaba registrada" : "Venta registrada"}: {done.id}</p>
        <p className="mt-1 text-sm">Total {formatARS(done.total)}. El stock ya se descontó{done.replayed ? " (una sola vez)" : ""} y quedó en el historial de movimientos.</p>
        <button type="button" onClick={reset} className="mt-3 min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald" data-testid="nueva-venta">Registrar otra venta</button>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="form-venta">
      {step === "armar" && (
        <>
          <div>
            <label htmlFor="venta-buscar" className={labelCls}>Agregar producto (nombre, colección o SKU)</label>
            <input id="venta-buscar" type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" placeholder="Ej.: Storm, 30th, ZH-…" className={`${inputCls} mt-1`} />
            {q.trim() && (
              <ul className="mt-2 divide-y divide-ink/10 rounded-lg border border-ink/15 bg-white" aria-label="Resultados" data-testid="venta-resultados">
                {matches.length === 0 && <li className="px-3 py-3 text-sm text-ink/70">Ningún producto coincide (o ya está en la venta).</li>}
                {matches.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => add(p)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gold/30" data-testid={`agregar-venta-${p.id}`}>
                      <span className="min-w-0"><b className="block truncate">{p.title}</b><span className="font-mono text-xs text-ink/60">{p.sku}</span></span>
                      <span className="shrink-0 text-xs text-ink/70">{p.stock === null ? "stock pendiente" : `stock ${p.stock}`}{p.low ? " · bajo" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink/40 bg-white/60 p-6 text-center text-sm text-ink/70">Todavía no agregaste productos. Buscá uno arriba.</p>
          ) : (
            <ul className="space-y-3" data-testid="venta-lineas">
              {lines.map((l, i) => {
                const p = byId.get(l.productId)!;
                const pr = parsed[i];
                const over = p.stock !== null && pr.qty !== null && pr.qty > p.stock;
                return (
                  <li key={l.productId} className="rounded-lg border border-ink/15 bg-white p-3" data-testid={`venta-linea-${l.productId}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-semibold leading-tight">{p.title}</p><p className="text-xs text-ink/65"><span className="font-mono">{p.sku}</span> · {p.stock === null ? "stock pendiente" : `stock actual ${p.stock}`}{p.low ? " · stock bajo" : ""}</p></div>
                      <button type="button" onClick={() => change(() => setLines((ls) => ls.filter((x) => x.productId !== l.productId)))} className="min-h-11 shrink-0 px-2 text-sm font-semibold underline hover:text-vermilion" aria-label={`Quitar ${p.title} de la venta`}>Quitar</button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:max-w-md">
                      <div>
                        <label htmlFor={`cant-${l.productId}`} className={labelCls}>Cantidad</label>
                        <input id={`cant-${l.productId}`} inputMode="numeric" autoComplete="off" value={l.quantity} onChange={(e) => change(() => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, quantity: e.target.value.replace(/\D/g, "").slice(0, 3) } : x))))} aria-invalid={pr.qty === null || over} className={`${inputCls} mt-1`} data-testid={`venta-cantidad-${l.productId}`} />
                      </div>
                      <div>
                        <label htmlFor={`precio-${l.productId}`} className={labelCls}>Precio de venta c/u ($)</label>
                        <input id={`precio-${l.productId}`} inputMode="numeric" autoComplete="off" value={l.price} onChange={(e) => change(() => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, price: e.target.value.replace(/\D/g, "").slice(0, 9) } : x))))} aria-invalid={!pr.pesos} placeholder={p.priceMinor ? undefined : "Sin precio de lista"} className={`${inputCls} mt-1`} data-testid={`venta-precio-${l.productId}`} />
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-ink/65">{p.priceMinor ? `Precio de lista hoy: ${formatARS(p.priceMinor)}. ` : "Este producto no tiene precio de lista: escribí el precio cobrado. "}Pesos enteros; se guarda el precio que escribas.</p>
                    {over && <p role="alert" className="mt-1 text-sm font-semibold text-vermilion">Stock insuficiente: hay {p.stock}.</p>}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
            <div>
              <label htmlFor="venta-pago" className={labelCls}>Método de pago</label>
              <select id="venta-pago" value={payment} onChange={(e) => change(() => setPayment(e.target.value))} className={`${inputCls} mt-1`} data-testid="venta-pago">
                <option value="">Elegí un método</option>
                {paymentMethods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="venta-nota" className={labelCls}>Observación (opcional)</label>
              <input id="venta-nota" maxLength={300} value={note} onChange={(e) => change(() => setNote(e.target.value))} autoComplete="off" placeholder="Ej.: venta en persona, cliente de Haedo" className={`${inputCls} mt-1`} data-testid="venta-nota" />
            </div>
          </div>
          <p className="text-lg font-semibold" data-testid="venta-total-armado">Total: {formatARS(total)}</p>
          <p className="text-xs text-ink/65">No se aplican descuentos solos: el total es la suma de lo que escribas. Una consulta por WhatsApp o un carrito armado nunca descuentan stock; solo una venta confirmada acá.</p>
          <button type="button" onClick={review} disabled={busy} className="min-h-12 rounded-lg bg-emerald px-6 text-base font-semibold text-paper hover:bg-emerald-2 disabled:opacity-50" data-testid="revisar-venta">{busy ? "Preparando…" : "Revisar venta"}</button>
        </>
      )}

      {step === "revisar" && preview && (
        <div className="rounded-xl border border-ink/20 bg-white p-4" data-testid="venta-resumen">
          <h3 className="text-lg font-semibold">Resumen: revisá antes de confirmar</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink/70"><tr><th scope="col" className="py-1 pr-3">Producto</th><th scope="col" className="py-1 pr-3">Cant.</th><th scope="col" className="py-1 pr-3">Precio c/u</th><th scope="col" className="py-1 pr-3">Subtotal</th><th scope="col" className="py-1">Stock</th></tr></thead>
              <tbody className="divide-y divide-ink/10">
                {preview.lines.map((l) => (
                  <tr key={l.productId} data-testid={`resumen-venta-${l.productId}`}>
                    <td className="py-2 pr-3"><b>{l.title}</b><span className="block font-mono text-xs text-ink/60">{l.sku}</span></td>
                    <td className="py-2 pr-3">{l.quantity}</td>
                    <td className="py-2 pr-3">{formatARS(l.unitPriceMinor)}</td>
                    <td className="py-2 pr-3">{formatARS(l.lineTotalMinor)}</td>
                    <td className="py-2">{l.problem ? <span className="font-semibold text-vermilion">{l.problem}</span> : <span data-testid={`stock-resultante-${l.productId}`}>{l.stockNow} → <b>{l.stockAfter}</b></span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-3 grid gap-1 text-sm sm:max-w-md">
            <div className="flex justify-between"><dt className="text-ink/70">Método de pago</dt><dd className="font-semibold">{paymentMethods.find((m) => m.id === payment)?.label}</dd></div>
            {note.trim() && <div className="flex justify-between gap-3"><dt className="text-ink/70">Observación</dt><dd className="text-right font-semibold">{note.trim()}</dd></div>}
            <div className="flex items-end justify-between border-t border-ink/15 pt-2"><dt className="font-bold">Total</dt><dd className="text-2xl font-extrabold" data-testid="venta-total-resumen">{formatARS(preview.totalMinor)}</dd></div>
          </dl>
          {!preview.ok && <p role="alert" className="mt-3 text-sm font-semibold text-vermilion">Hay productos que no se pueden vender tal como está armada la venta. Volvé a editar.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={confirm} disabled={busy || !preview.ok} className="min-h-12 rounded-lg bg-emerald px-6 text-base font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50" data-testid="confirmar-venta">{busy ? "Registrando…" : "Confirmar venta"}</button>
            <button type="button" onClick={() => { setStep("armar"); setPreview(null); }} disabled={busy} className="min-h-12 rounded-lg border border-ink/40 px-5 text-sm font-semibold hover:border-emerald disabled:opacity-50" data-testid="volver-editar">Volver a editar</button>
          </div>
        </div>
      )}
      <p role="alert" aria-live="assertive" className="min-h-5 text-sm font-semibold text-vermilion" data-testid="venta-error">{error}</p>
    </div>
  );
}
