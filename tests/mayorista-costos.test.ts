import { describe, expect, it } from "vitest";
import { wholesaleResult } from "@/features/pedidos/mayorista-costos";

describe("excedentes cobrados a mayoristas", () => {
  it("no cuenta el excedente ni su devolución como ganancia o pérdida de la venta", () => {
    const base = { agreed: 15_000_000, agreedUsd: 10_000, received: 16_500_000, rate: 15_000_000, cancelled: false,
      costs: [{ id: "c", inquiryId: "p", category: "mercaderia", currency: "USD", amountMinor: 6000, arsMinor: null, exchangeRateMinor: null, paidAt: 1, note: null, createdAt: 1, createdByEmail: "admin@example.com", voidedAt: null, voidReason: null, voidedByEmail: null }] };
    expect(wholesaleResult({ ...base, refunded: 0 }).profit).toBe(4000);
    expect(wholesaleResult({ ...base, refunded: 1_500_000 }).profit).toBe(4000);
    expect(wholesaleResult({ ...base, refunded: 2_250_000 }).profit).toBe(3500);
    expect(wholesaleResult({ ...base, refunded: 16_500_000, cancelled: true }).profit).toBe(-6000);
  });
});
