import { usdToArsExactMinor } from "@/features/fx/convert";

const roundedRatio = (amount: number, numerator: number, denominator: number) =>
  Number((BigInt(amount) * BigInt(numerator) + BigInt(denominator) / 2n) / BigInt(denominator));

/** Conserva el equivalente histórico acordado, incluido el redondeo que tuviera un pedido antiguo. */
export function usdOrderPayment(usdMinor: number, order: { agreedMinor: number; agreedUsdMinor: number | null; rate10k: number | null }, confirmedMinor: number) {
  if (order.agreedUsdMinor && order.agreedMinor > 0) {
    const remaining = Math.max(0, order.agreedMinor - confirmedMinor);
    const balanceUsd = roundedRatio(remaining, order.agreedUsdMinor, order.agreedMinor);
    return {
      amountMinor: remaining > 0 && usdMinor === balanceUsd ? remaining : roundedRatio(usdMinor, order.agreedMinor, order.agreedUsdMinor),
      exchangeRate10k: roundedRatio(order.agreedMinor, 10_000, order.agreedUsdMinor),
    };
  }
  return order.rate10k ? { amountMinor: usdToArsExactMinor(usdMinor, order.rate10k), exchangeRate10k: order.rate10k } : null;
}
