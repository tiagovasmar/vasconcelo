import { AccessLinkButton } from "@/components/access-link-button";
import { AdminForm, type FormField } from "@/components/admin-form";
import { when } from "@/features/consultas/ui";
import { formatUSD } from "@/features/fx/convert";
import type { listWholesaleOrderCosts } from "@/features/pedidos/mayorista-admin";
import { BASIC_COSTS, COST_LABELS, wholesaleCostTotal, wholesaleResult } from "@/features/pedidos/mayorista-costos";

const money = (minor: number, currency = "ARS") => new Intl.NumberFormat("es-AR", {
  style: "currency", currency, currencyDisplay: "code",
}).format(minor / 100);

type Costs = Awaited<ReturnType<typeof listWholesaleOrderCosts>>;
type Category = keyof typeof COST_LABELS;
const hints = {
  mercaderia: "Cuando pagues al proveedor.",
  envio: "Cuando pagues el transporte.",
  aduana: "Cuando pagues aduana. Si no hubo cargo, guardá 0.",
};

function CostGroup({ endpoint, category, costs, rate, optional }: {
  endpoint: string; category: Category; costs: Costs; rate: number | null; optional?: boolean;
}) {
  const saved = costs.some((cost) => cost.voidedAt === null);
  const total = wholesaleCostTotal(costs, rate);
  const label = COST_LABELS[category];
  const amount: FormField = { name: "amountMinor", label: `Importe de ${label.toLowerCase()} en USD`, type: "usd", required: true, placeholder: "0,00" };
  return (
    <section className="min-w-0 rounded-lg border border-ink/15 p-3" aria-label={label}>
      <h3 className="font-semibold">{label}</h3>
      {!optional && <p className="mt-1 text-xs text-ink/75">{hints[category as keyof typeof hints]}</p>}
      <p className="my-2 text-sm font-bold">{!saved ? "Pendiente" : total === null ? "Falta tipo de cambio" : formatUSD(total)}</p>
      <AdminForm endpoint={endpoint} compact fixed={{ action: "wholesale_cost", category, currency: "USD" }}
        fields={[amount]} submit={saved ? "Sumar otro pago en USD" : "Guardar en USD"} ok={`${label} guardado.`} testId={`costo-${category}-usd`} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold underline">Pagué en pesos</summary>
        <div className="mt-2">
          <AdminForm endpoint={endpoint} compact fixed={{ action: "wholesale_cost", category, currency: "ARS" }} fields={[
            { ...amount, label: `Importe de ${label.toLowerCase()} en pesos`, type: "pesos" },
            { name: "exchangeRateMinor", label: "Pesos por dólar", type: "pesos", required: true, defaultValue: rate ? String(Math.round(rate / 100) / 100) : "", help: "Podés reemplazarlo por el cambio que usaste en este pago." },
          ]} submit="Guardar en pesos" ok={`${label} guardado.`} testId={`costo-${category}-ars`} />
        </div>
      </details>
      {costs.length > 0 && <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold underline">Ver historial</summary>
        <ul className="mt-2 divide-y divide-ink/10">
          {costs.map((cost) => (
            <li key={cost.id} className="py-2 text-sm">
              <p><b>{money(cost.amountMinor, cost.currency)}</b> · {when(cost.paidAt)}</p>
              {cost.note && <p className="text-ink/75">{cost.note}</p>}
              {cost.voidedAt !== null ? <p className="font-semibold text-vermilion">Anulado · {cost.voidReason}</p> : (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs font-semibold underline">Corregir importe</summary>
                  <p className="my-2 text-xs">Anulá este importe y cargá el correcto.</p>
                  <AdminForm endpoint={endpoint} compact fixed={{ action: "wholesale_void_cost", costId: cost.id }} fields={[
                    { name: "reason", label: "Motivo de la anulación", required: true, maxLength: 300 },
                  ]} submit="Anular gasto" ok="Gasto anulado." idempotent={false} />
                </details>
              )}
            </li>
          ))}
        </ul>
      </details>}
    </section>
  );
}

export function AdminWholesaleOrder({ id, carrier, trackingNumber, costs, agreed, agreedUsd, received, refunded, rate, cancelled, saleCommission }: {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  costs: readonly Costs[number][];
  agreed: number | null;
  agreedUsd: number | null;
  received: number;
  refunded: number;
  rate: number | null;
  cancelled: boolean;
  saleCommission: number;
}) {
  const endpoint = `/api/admin/pedidos/${id}`;
  const { activeCosts, commission, commissionUsd, total, complete, revenue, refundedUsd, profit } = wholesaleResult({ costs, agreed, agreedUsd, received, refunded, rate, cancelled, saleCommission });
  const margin = profit !== null && revenue !== null && refundedUsd !== null && revenue > refundedUsd ? profit / (revenue - refundedUsd) : null;
  const card = "mt-6 rounded-xl border border-ink/15 bg-white p-4 sm:p-5";
  const extras = (["comision", "otro"] as const).filter((category) => costs.some((cost) => cost.category === category));

  return (
    <>
      <section className={card} aria-labelledby="admin-mayorista-guia">
        <h2 id="admin-mayorista-guia" className="text-base font-semibold">Seguimiento para el cliente</h2>
        <p className="my-2 text-sm text-ink/75">El enlace muestra la etapa y la guía del envío.</p>
        <AccessLinkButton inquiryId={id} />
        <div className="mt-4">
          <AdminForm key={JSON.stringify([carrier, trackingNumber])} endpoint={endpoint} fixed={{ action: "wholesale_guide" }} fields={[
            { name: "carrier", label: "Transportista", defaultValue: carrier ?? "", maxLength: 80 },
            { name: "trackingNumber", label: "Número de guía", defaultValue: trackingNumber ?? "", maxLength: 100 },
          ]} submit="Guardar guía" ok="Guía actualizada." idempotent={false} testId="form-mayorista-guia" />
        </div>
      </section>

      <section className={card} aria-labelledby="admin-mayorista-costos">
        <h2 id="admin-mayorista-costos" className="text-base font-semibold">Costos y resultado del pedido</h2>
        <p className="mt-1 text-sm text-ink/75">Guardá cada costo cuando lo pagues. Estos importes solo los ves vos.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {BASIC_COSTS.map((category) => <CostGroup key={category} endpoint={endpoint} category={category} costs={costs.filter((cost) => cost.category === category)} rate={rate} />)}
        </div>
        {extras.length > 0 && <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold underline">Otros costos de este pedido</summary>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {extras.map((category) => <CostGroup key={category} endpoint={endpoint} category={category} costs={costs.filter((cost) => cost.category === category)} rate={rate} optional />)}
          </div>
        </details>}
        <dl className="mt-4 grid gap-3 rounded-lg bg-paper-2 p-3 sm:grid-cols-3" data-testid="resultado-mayorista">
          <div><dt className="text-xs text-ink/75">{cancelled ? "Cobrado neto" : "Venta acordada"}</dt><dd className="font-bold">{revenue === null ? "Pendiente" : formatUSD(revenue)}</dd></div>
          <div><dt className="text-xs text-ink/75">Costo total cargado</dt><dd className="font-bold">{!activeCosts.length && commission === 0 ? "Pendiente" : total === null ? "Falta tipo de cambio" : formatUSD(total)}</dd></div>
          <div><dt className="text-xs text-ink/75">{profit !== null && profit < 0 ? "Pérdida" : "Ganancia"}{complete ? "" : " preliminar"}</dt>
            <dd className="font-bold">{profit === null ? "Pendiente" : formatUSD(profit)}</dd>
            {margin !== null && <dd className="text-xs text-ink/75">Margen {new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(margin)}</dd>}
          </div>
        </dl>
        {commission > 0 && <p className="mt-2 text-xs text-ink/75">Comisión de la venta vinculada: {commissionUsd === null ? money(commission) : formatUSD(commissionUsd)}.</p>}
        {!complete && <p className="mt-2 text-xs text-ink/75">El resultado se completa al registrar Producto, Envío y Aduana, incluso si alguno fue cero.</p>}
      </section>
    </>
  );
}
