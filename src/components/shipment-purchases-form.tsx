"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { newKey } from "./admin-form";

type Purchase = { id: string; supplier: string; reference: string | null; date: number; quantity: number };
const dateLabel = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export function ShipmentPurchasesForm({ shipmentId, purchases }: { shipmentId?: string; purchases: Purchase[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const key = useRef(newKey());
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const purchaseIds = selected.filter((id) => purchases.some((p) => p.id === id));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!purchaseIds.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/envios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shipmentId ? { action: "purchases", shipmentId, purchaseIds }
          : { action: "create_dispatch", label, purchaseIds, idempotencyKey: key.current }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message ?? "No se pudieron sumar las compras."); return; }
      setSelected([]);
      setLabel("");
      key.current = newKey();
      router.refresh();
    } catch {
      setError("Se cortó la conexión. Podés reintentar con las mismas compras.");
    } finally {
      setBusy(false);
    }
  }

  return <details className="mt-3 border-t border-ink/10 pt-3">
    <summary className="cursor-pointer text-sm font-semibold">{shipmentId ? "Sumar compras de stock" : "Nuevo despacho de compras"}</summary>
    <form onSubmit={submit} className="space-y-2">
      {!shipmentId && <label className="mt-2 block text-sm font-semibold">Nombre del despacho
        <input className="block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3" required minLength={2} maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>}
      <p className="mt-2 text-xs text-ink/75">Se suman las unidades que todavía no están en un envío. Las que no tienen destino se asignan a reventa.</p>
      <fieldset disabled={busy} className="max-h-64 divide-y divide-ink/10 overflow-y-auto">
        <legend className="sr-only">Compras disponibles</legend>
        {purchases.map((p) => <label key={p.id} className="flex items-center gap-3 py-2 text-sm">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={purchaseIds.includes(p.id)} onChange={(event) =>
            setSelected((old) => event.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id))} />
          <span><b>{p.supplier}{p.reference && ` · ${p.reference}`}</b><br />{dateLabel.format(p.date)} · {p.quantity} u. · {p.id}</span>
        </label>)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-vermilion">{error}</p>}
      <button type="submit" disabled={!purchaseIds.length || busy} className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper disabled:opacity-50">
        {busy ? "Guardando…" : `${shipmentId ? "Sumar compras" : "Crear despacho"}${purchaseIds.length ? ` (${purchaseIds.length})` : ""}`}
      </button>
    </form>
  </details>;
}
