import { describe, expect, it } from "vitest";
import { nextAction, senaFor, transferDue, type OrderPaymentInput } from "@/features/pedidos/etapas";

const order: OrderPaymentInput = { kind: "encargo", stage: "confirmado_tienda", agreedMinor: 10_000_000, confirmedMinor: 0, pendingReceipts: 0, cancelled: false };
const fmt = (n: number) => String(n);

describe("transferencia del encargo y mayorista", () => {
  it("calcula el 20% del importe confirmado en centavos", () => {
    expect(senaFor(order.agreedMinor)).toBe(2_000_000);
    expect(transferDue(order)).toEqual({ kind: "sena", amountMinor: 2_000_000 });
    expect(transferDue({ ...order, kind: "mayorista" })).toEqual(transferDue(order));
  });
  it("no solicita dinero por una cotización sin confirmar, sin importe o en compras de stock", () => {
    for (const p of [{ ...order, stage: "solicitud_recibida" }, { ...order, agreedMinor: null }, { ...order, kind: "stock" as const }]) expect(transferDue(p)).toBeNull();
    expect(nextAction({ ...order, stage: "solicitud_recibida" }, fmt)).toContain("Todavía no hace falta pagar");
  });
  it("descuenta lo abonado de la seña sin pedirla completa otra vez", () => {
    const partial = { ...order, confirmedMinor: 500_000 };
    expect(transferDue(partial)).toEqual({ kind: "sena", amountMinor: 1_500_000 });
    expect(nextAction(partial, fmt)).toContain("falta abonar 1500000");
  });
  it("no pide el 80% mientras viaja ni vuelve a pedir lo que está en revisión", () => {
    expect(transferDue({ ...order, stage: "en_transito", confirmedMinor: 2_000_000 })).toBeNull();
    const review = { ...order, pendingReceipts: 1 };
    expect(transferDue(review)).toBeNull();
    expect(nextAction(review, fmt)).toContain("no vuelvas a transferir");
  });
  it("al llegar a Argentina solicita solo la diferencia de los pagos confirmados", () => {
    expect(transferDue({ ...order, stage: "recibido_argentina", confirmedMinor: 2_000_000 })).toEqual({ kind: "resto", amountMinor: 8_000_000 });
    expect(transferDue({ ...order, stage: "recibido_argentina", confirmedMinor: 3_000_000 })).toEqual({ kind: "resto", amountMinor: 7_000_000 });
  });
  it("no solicita transferencias con pago completo, cancelación o entrega", () => {
    for (const p of [{ ...order, confirmedMinor: 10_000_000 }, { ...order, cancelled: true }, { ...order, stage: "entregado" }]) expect(transferDue(p)).toBeNull();
    expect(nextAction({ ...order, confirmedMinor: 10_000_000 }, fmt)).toContain("No hace falta que transfieras más");
  });
});
