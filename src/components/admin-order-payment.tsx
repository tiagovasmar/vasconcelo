"use client";

import { useState } from "react";
import { AdminForm, parseMoney, type FormField } from "./admin-form";
import { formatARS } from "@/lib/format";
import { orderUsdEquivalent } from "@/features/pedidos/mayorista-costos";
import { usdOrderPayment } from "@/features/pedidos/payment-money";

export function AdminOrderPayment({ endpoint, wholesale, agreedMinor, agreedUsdMinor, rate10k, confirmedMinor, balance, depositDue, defaultKind, receipts }: {
  endpoint: string; wholesale: boolean; agreedMinor: number | null; agreedUsdMinor: number | null; rate10k: number | null;
  confirmedMinor: number; balance: number | null; depositDue: number | null; defaultKind: string; receipts: Array<{ value: string; label: string }>;
}) {
  const canUseUsd = wholesale && agreedMinor !== null && Boolean(agreedUsdMinor || rate10k);
  const [currency, setCurrency] = useState<"ARS" | "USD">(canUseUsd ? "USD" : "ARS");
  const suggested = Math.max(0, depositDue || balance || 0);
  const suggestedUsd = agreedUsdMinor && agreedMinor ? Math.round(suggested * agreedUsdMinor / agreedMinor) : orderUsdEquivalent(suggested, rate10k);
  const fields: FormField[] = [
    { name: "kind", label: "Tipo", type: "select", required: true, defaultValue: defaultKind, options: !wholesale && defaultKind === "pago_total" ? [{ value: "pago_total", label: "Pago total" }, { value: "otro", label: "Otro pago" }] : [
      { value: "sena", label: "Seña" }, { value: "saldo", label: "Saldo" }, { value: "pago_total", label: "Pago total" }, { value: "otro", label: "Otro pago" },
    ] },
    { name: "amountMinor", label: `Importe recibido ahora en ${currency === "USD" ? "USD" : "pesos"}`, type: currency === "USD" ? "usd" : "pesos", required: true,
      defaultValue: wholesale && suggested > 0 ? String((currency === "USD" ? suggestedUsd ?? 0 : suggested) / 100) : "" },
    { name: "method", label: "Medio", type: "select", required: true, options: [{ value: "transferencia", label: "Transferencia" }, { value: "efectivo", label: "Efectivo" }, { value: "otro", label: "Otro" }] },
    { name: "paidAt", label: "Fecha real del ingreso", type: "date", required: true },
    { name: "receiptId", label: "Comprobante que respalda el pago", type: "select", optional: true, options: receipts },
    { name: "internalNote", label: "Nota interna (opcional)", optional: true },
  ];
  return <>
    {canUseUsd && <label className="mb-3 grid max-w-xs gap-1 text-sm font-semibold">Moneda del ingreso
      <select value={currency} onChange={(event) => setCurrency(event.target.value as "ARS" | "USD")} className="min-h-11 rounded-md border border-ink/40 bg-white px-3" data-testid="moneda-pago">
        <option value="USD">USD · dólares</option><option value="ARS">ARS · pesos</option>
      </select>
    </label>}
    {currency === "USD" && <p className="mb-3 text-sm text-ink/75">Se conserva el importe en USD con sus centavos. El equivalente contable usa el total y la conversión acordados del pedido; no cambia con el dólar del día.</p>}
    <AdminForm key={`${currency}-${confirmedMinor}-${balance}`} endpoint={endpoint} fixed={{ action: "payment", currency }} fields={fields}
      submit="Confirmar ingreso" ok="Ingreso confirmado." testId="form-pago" preview={(values) => {
        const original = parseMoney(String(values.amountMinor ?? ""));
        if (currency !== "USD" || original === null || original <= 0 || agreedMinor === null) return null;
        const converted = usdOrderPayment(original, { agreedMinor, agreedUsdMinor, rate10k }, confirmedMinor);
        return converted ? <p className="text-sm text-ink/75" data-testid="pago-equivalente">Equivalente del pedido: <b>{formatARS(converted.amountMinor)}</b>.</p> : null;
      }} />
  </>;
}
