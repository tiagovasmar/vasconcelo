"use client";

import { provinces } from "@/features/inquiries/delivery";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { newKey } from "./admin-form";
import { formatARS } from "@/lib/format";

export function PreorderForm({ parcelId, quantity, unitMinor, hours, productPath }: { parcelId: number; quantity: number; unitMinor: number; hours: number; productPath: string }) {
  const router = useRouter();
  const deliveryId = useId();
  const key = useRef(newKey());
  const [units, setUnits] = useState(1);
  const [delivery, setDelivery] = useState("retiro");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  return <form className="mt-3 space-y-2 rounded-lg border border-emerald/30 bg-white p-3" onSubmit={async (event) => {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/preventas", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parcelId, quantity: units, expectedUnitMinor: unitMinor, delivery: { method: delivery, locality: fields.get("locality"), province: fields.get("province"), postalCode: fields.get("postalCode") }, idempotencyKey: key.current }) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "No se pudo solicitar la reserva.");
        setLogin(res.status === 401);
        return;
      }
      router.push(`/cuenta/consultas/${data.reference}`);
    } catch {
      setError("No se pudo completar la solicitud. Reintentá.");
    } finally {
      setBusy(false);
    }
  }}>
    <p className="font-semibold">{formatARS(unitMinor)} por unidad · {quantity} u. en este lote</p>
    <label className="block text-sm">Unidades a reservar
      <input className="ml-2 w-16 rounded border border-ink/40 px-2 py-2" type="number" min={1} max={Math.min(20, quantity)} required value={units} onChange={(e) => setUnits(e.target.valueAsNumber || 1)} />
    </label>
    <div>
      <label className="block text-sm" htmlFor={deliveryId}>Entrega</label>
      <select id={deliveryId} name="delivery" value={delivery} onChange={(e) => setDelivery(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-ink/40 px-2">
        <option value="retiro">Retiro en tienda</option><option value="andreani">Envío por Andreani</option><option value="moto">Moto en CABA y AMBA</option>
      </select>
    </div>
    {delivery !== "retiro" && <div className="grid gap-2">
      <label>Localidad<input className="block min-h-11 w-full rounded border border-ink/40 px-2" name="locality" required maxLength={80} /></label>
      {delivery === "andreani" && <label>Provincia<select className="block min-h-11 w-full rounded border border-ink/40 px-2" name="province" aria-label="Provincia" required defaultValue="">
        <option value="">Elegí tu provincia</option>{provinces.map((p) => <option key={p}>{p}</option>)}
      </select></label>}
      <label>Código postal<input className="block min-h-11 w-full rounded border border-ink/40 px-2" name="postalCode" required maxLength={8} /></label>
      <p className="text-xs">El costo de envío al domicilio se coordina con la tienda.</p>
    </div>}
    <p className="text-sm">Seña de {formatARS(unitMinor * units / 5)}. Retención de {hours} h para cargar el comprobante. La tienda confirma la reserva cuando verifica la seña.</p>
    <button disabled={busy} className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-paper">{busy ? "Solicitando…" : "Reservar con el 20%"}</button>
    {error && <p role="alert" className="text-sm text-vermilion">{error}</p>}
    {login && <Link className="block underline" href={`/cuenta/ingresar?next=${encodeURIComponent(productPath)}`}>Ingresar para reservar</Link>}
  </form>;
}
