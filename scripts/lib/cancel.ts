import type { Db } from "../../src/db/client";
import { cancelOrder } from "../../src/features/pedidos/service";

/** Cancela un pedido con una clave de operación propia del script de siembra. */
export const cancelOrderSafe = (db: Db, inquiryId: string, actor: { id: string; email: string }, now: number) =>
  cancelOrder(db, inquiryId, { reason: "No se pudo cumplir el encargo (dato de prueba)", publicText: "El pedido fue cancelado porque el paquete se extravió. Registramos el reintegro de tu seña.", idempotencyKey: `dev-cancel-${inquiryId}`.padEnd(24, "0") }, actor, now);
