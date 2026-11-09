import type { wholesaleOrderCosts } from "@/db/schema";

export const COST_LABELS = { mercaderia: "Producto", envio: "Envío", aduana: "Aduana", comision: "Comisión", otro: "Otro" } as const;
export const BASIC_COSTS = ["mercaderia", "envio", "aduana"] as const;

type Cost = typeof wholesaleOrderCosts.$inferSelect;

export function orderUsdEquivalent(arsMinor: number, rate10k: number | null): number | null {
  if (arsMinor === 0) return 0;
  if (!rate10k || rate10k <= 0) return null;
  return Math.round(arsMinor * 10_000 / rate10k);
}

export function costUsdEquivalent(cost: Cost, orderRate10k: number | null): number | null {
  return cost.currency === "USD" ? cost.amountMinor
    : orderUsdEquivalent(cost.amountMinor, cost.exchangeRateMinor === null ? orderRate10k : cost.exchangeRateMinor * 100);
}

export function wholesaleCostTotal(costs: readonly Cost[], rate: number | null) {
  let total = 0;
  for (const cost of costs) {
    if (cost.voidedAt !== null) continue;
    const usd = costUsdEquivalent(cost, rate);
    if (usd === null) return null;
    total += usd;
  }
  return total;
}

export function wholesaleResult({ costs, agreed, agreedUsd, received, refunded, rate, cancelled, saleCommission = 0 }: {
  costs: readonly Cost[]; agreed: number | null; agreedUsd: number | null;
  received: number; refunded: number; rate: number | null; cancelled: boolean; saleCommission?: number;
}) {
  const activeCosts = costs.filter((cost) => cost.voidedAt === null);
  // Si el pedido tiene una comisión propia, esa es la fuente para evitar sumar el mismo cargo dos veces.
  const commission = activeCosts.some((cost) => cost.category === "comision") ? 0 : saleCommission;
  const recorded = wholesaleCostTotal(activeCosts, rate);
  const commissionUsd = orderUsdEquivalent(commission, rate);
  const total = (!activeCosts.length && commission === 0) || recorded === null || commissionUsd === null ? null : recorded + commissionUsd;
  const complete = BASIC_COSTS.every((category) => activeCosts.some((cost) => cost.category === category));
  const saleUsd = agreedUsd ?? (agreed === null ? null : orderUsdEquivalent(agreed, rate));
  const revenue = cancelled ? orderUsdEquivalent(received - refunded, rate) : saleUsd;
  const refundedUsd = cancelled ? 0 : orderUsdEquivalent(refunded, rate);
  const profit = revenue !== null && total !== null && refundedUsd !== null ? revenue - refundedUsd - total : null;
  return { activeCosts, commission, commissionUsd, total, complete, revenue, refundedUsd, profit };
}
