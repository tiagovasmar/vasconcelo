export type SaleErrorCode =
  | "invalid_input" | "not_found" | "insufficient_stock" | "stock_pending" | "idempotency_conflict" | "already_voided" | "order_only" | "retired"
  | "already_converted" | "already_linked" | "voided" | "converted" | "stale"
  | "order_rule" | "forbidden" | "too_large" | "unsupported" | "duplicate" | "not_configured";

/** Error de negocio de ventas, stock y consultas: lleva el estado HTTP, un código estable y un mensaje en español para el panel. */
export class SaleError extends Error {
  constructor(public readonly status: number, public readonly code: SaleErrorCode, message: string, public readonly details?: unknown) {
    super(message);
  }
}
