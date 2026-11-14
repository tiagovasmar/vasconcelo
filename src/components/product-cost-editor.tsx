"use client";

import { useId, useState } from "react";
import { AdminForm } from "@/components/admin-form";
import type { ProductLogistics } from "@/features/costos/product-logistics";
import { arsMinorToUsdMinor, formatUSD, usdInputText } from "@/features/fx/convert";
import { parseMoney } from "@/lib/money-input";

const field = "mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base";
const percent = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

type Props = {
  productId: string;
  logistics?: ProductLogistics;
  entry?: { cost: { currency: "USD" | "ARS"; amountMinor: number } | null; version: number };
  averageUsd: number | null;
  rate10k: number | null;
  retailUsd: number | null;
  wholesaleUsd: number | null;
};

function Margin({ label, price, cost }: { label: string; price: number | null; cost: number | null }) {
  const gain = price && cost !== null ? price - cost : null;
  return <p className={gain !== null && gain < 0 ? "text-sm font-medium text-vermilion" : "text-sm text-ink/80"}>
    {label} {gain === null || !price ? "—" : `${formatUSD(gain)} por unidad · ${percent.format(gain / price)}${gain < 0 ? " · Debajo del costo" : ""}`}
  </p>;
}

export function ProductCostEditor({ productId, logistics, entry, averageUsd, rate10k, retailUsd, wholesaleUsd }: Props) {
  const id = useId();
  const [base, setBase] = useState("");
  const [commission, setCommission] = useState("");
  const [retail, setRetail] = useState(() => usdInputText(retailUsd));
  const [wholesale, setWholesale] = useState(() => usdInputText(wholesaleUsd));
  const [shipping, setShipping] = useState<string | null>(null);
  const [customs, setCustoms] = useState<string | null>(null);
  const shippingText = shipping ?? usdInputText(logistics?.shippingMinor ?? null);
  const customsText = customs ?? usdInputText(logistics?.customsMinor ?? null);
  const extras = [commission, shippingText, customsText].map((value) => value.trim() ? parseMoney(value) : 0);
  const baseMinor = parseMoney(base);
  const estimated = baseMinor && extras.every((value) => value !== null)
    ? baseMinor + extras.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  return <AdminForm endpoint="/api/admin/costos" idempotent={false} resetAfterSave={false}
    fixed={{ action: "product_cost", productId, expectedVersion: entry?.version ?? 0 }}
    fields={[
      { name: "currency", label: "Moneda", type: "select", required: true, defaultValue: entry?.cost?.currency ?? "USD", options: [{ value: "USD", label: "USD" }, { value: "ARS", label: "ARS" }] },
      { name: "amountMinor", label: "Costo final de referencia", type: "usd", defaultValue: usdInputText(entry?.cost?.amountMinor ?? null), placeholder: "0,00" },
    ]} submit="Guardar costo" ok="Costo guardado." testId={`costo-producto-${productId}`}
    preview={(values, update) => {
      const amount = parseMoney(String(values.amountMinor ?? ""));
      const reference = amount ? (values.currency === "ARS" ? arsMinorToUsdMinor(amount, rate10k) : amount) : null;
      const historical = averageUsd ?? reference;
      const previewCost = base.trim() ? estimated : historical;
      return <details className="rounded-lg border border-ink/15 bg-paper p-3 sm:col-span-2">
      <summary className="cursor-pointer text-sm font-semibold">Calcular costo y margen en USD</summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { name: "base", label: "Costo de compra", value: base, set: setBase },
          { name: "commission", label: "Comisiones de compra", value: commission, set: setCommission },
          { name: "shipping", label: "Envío por unidad", value: shippingText, set: setShipping },
          { name: "customs", label: "Aduana por unidad", value: customsText, set: setCustoms },
          { name: "retail", label: "Simular precio minorista", value: retail, set: setRetail },
          { name: "wholesale", label: "Simular precio mayorista", value: wholesale, set: setWholesale },
        ].map(({ name, label, value, set }) => <label key={name} htmlFor={`${id}-${name}`} className="text-xs font-semibold">{label}
          <input id={`${id}-${name}`} value={value} onChange={(event) => set(event.target.value)} inputMode="decimal" maxLength={28} className={field} />
        </label>)}
      </div>
      <div className="mt-3 space-y-1" aria-live="polite">
        <p className="text-sm font-semibold">{estimated !== null ? `Costo estimado por unidad ${formatUSD(estimated)}` : previewCost !== null ? `${averageUsd !== null ? "Promedio de compras" : "Costo de referencia"} por unidad ${formatUSD(previewCost)}` : "Ingresá el costo de compra para calcular el margen."}</p>
        <Margin label="Minorista" price={parseMoney(retail)} cost={previewCost} />
        <Margin label="Mayorista" price={parseMoney(wholesale)} cost={previewCost} />
        <p className="text-xs text-ink/75">Margen antes de comisiones y gastos de venta. Los precios de prueba quedan en esta calculadora.</p>
      </div>
      <button type="button" disabled={!estimated || estimated > 100_000_000} onClick={() => update({ currency: "USD", amountMinor: usdInputText(estimated) })} className="mt-3 min-h-11 rounded-md border border-ink/40 px-3 text-sm font-semibold disabled:opacity-50">Usar costo estimado</button>
    </details>;
    }} />;
}
