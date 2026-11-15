"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { newKey, parseMoney } from "./admin-form";

type Item = { id: number; title: string; available: number };
const input = "block min-h-11 w-full rounded border border-ink/40 bg-white px-2";

export function ImportCustomerSale({ purchaseId, items }: { purchaseId: string; items: Item[] }) {
  const router = useRouter();
  const group = useId();
  const operation = useRef(newKey());
  const [contact, setContact] = useState("");
  const [selected, setSelected] = useState<Record<number, { quantity: string; price: string }>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const chosen = items.filter((item) => selected[item.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !chosen.length) return;
    const lines = chosen.map((item) => ({
      itemId: item.id, quantity: Number(selected[item.id].quantity), unitPriceMinor: parseMoney(selected[item.id].price),
    }));
    if (lines.some((line) => !line.unitPriceMinor)) {
      setError("Ingresá un precio por unidad en cada producto seleccionado.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/admin/compras", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customer_sale", purchaseId, customerContact: contact, items: lines, idempotencyKey: operation.current }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message ?? "No se pudo crear la venta."); return; }
      setSaved(data.id);
      setSelected({});
      setContact("");
      operation.current = newKey();
      router.refresh();
    } catch { setError("Se cortó la conexión. Podés reintentar con los mismos datos."); }
    finally { setBusy(false); }
  }

  return <details className="rounded-lg border border-ink/15 p-3">
    <summary className="cursor-pointer font-semibold">Asignar a un cliente y crear venta</summary>
    <form className="mt-3 space-y-3" onSubmit={submit}>
      <p className="text-sm">Seleccioná los productos del cliente. Se guardan juntos en una venta pendiente de entrega.</p>
      <fieldset disabled={busy} className="space-y-3">
        <label className="text-sm font-semibold">Nombre o contacto del cliente
          <input className={input} value={contact} onChange={(e) => setContact(e.target.value)} required minLength={2} maxLength={150} />
        </label>
        {items.map((item) => {
          const draft = selected[item.id];
          return <div key={item.id} className="rounded border border-ink/15 p-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft)} onChange={(e) => {
              const checked = e.target.checked;
              setSelected((current) => {
                if (checked) return { ...current, [item.id]: { quantity: "1", price: "" } };
                const next = { ...current }; delete next[item.id]; return next;
              });
            }} />{item.title} · {item.available} libres</label>
            {draft && <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs" htmlFor={`${group}-qty-${item.id}`}>Cantidad
                <input id={`${group}-qty-${item.id}`} className={input} type="number" min={1} max={item.available} required value={draft.quantity}
                  onChange={(e) => setSelected({ ...selected, [item.id]: { ...draft, quantity: e.target.value } })} />
              </label>
              <label className="text-xs" htmlFor={`${group}-price-${item.id}`}>Precio por unidad (ARS)
                <input id={`${group}-price-${item.id}`} className={input} inputMode="decimal" required value={draft.price}
                  onChange={(e) => setSelected({ ...selected, [item.id]: { ...draft, price: e.target.value } })} />
              </label>
            </div>}
          </div>;
        })}
      </fieldset>
      <button disabled={!chosen.length || busy} className="min-h-11 rounded bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50">{busy ? "Guardando…" : "Crear venta"}</button>
      {error && <p role="alert" className="text-sm text-vermilion">{error}</p>}
      {saved && <p role="status" className="text-sm">Venta creada. <Link href={`/admin/ventas/${saved}`} className="underline">Ver {saved}</Link></p>}
    </form>
  </details>;
}
