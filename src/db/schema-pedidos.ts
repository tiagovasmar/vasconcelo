import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { inquiries, inquiryLines, sales, saleLines, accountingExpenses } from "./schema";

/**
 * Cuentas Google, avisos de reposición, seguimiento de pedidos y encargos, pagos, envíos agrupados, costos privados y catálogo mayorista (migración 0004).
 * Todo se apoya en `inquiries` (el pedido), `inquiry_lines` (sus artículos), `sales` y `stock_movements`: no hay un segundo sistema de pedidos ni de stock.
 * Fechas (ms desde 1970) e importes (centavos) son `bigint` en modo número, igual que el resto del esquema.
 */
const ms = (name: string) => bigint(name, { mode: "number" });

/** «Avisame cuando vuelva». No reserva stock ni garantiza precio; no es una consulta ni una venta. Un aviso activo por producto y correo. */
export const restockAlerts = pgTable(
  "restock_alerts",
  {
    id: text("id").primaryKey(),
    productId: text("product_id").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Correo en minúsculas. Con cuenta es el de la cuenta verificada; de invitado, el que escribió la persona. */
    email: text("email").notNull(),
    consentAt: ms("consent_at").notNull(),
    /** Texto exacto aceptado (constancia del consentimiento). */
    consentText: text("consent_text").notNull(),
    /** activo | cancelado | avisado */
    status: text("status").notNull().default("activo"),
    cancelTokenHash: text("cancel_token_hash").notNull(),
    createdAt: ms("created_at").notNull(),
    cancelledAt: ms("cancelled_at"),
    notifiedAt: ms("notified_at"),
  },
  (t) => [
    uniqueIndex("restock_alerts_one_active").on(t.productId, t.email).where(sql`${t.status} = 'activo'`),
    index("restock_alerts_product_idx").on(t.productId, t.status),
    index("restock_alerts_user_idx").on(t.userId),
  ],
);

/**
 * Seguimiento de un pedido (una consulta con seguimiento abierto por el dueño). La etapa LOGÍSTICA vive acá; el estado del PAGO se deriva aparte de `order_payments`.
 * `kind`: stock · encargo (traer a pedido) · mayorista.
 */
export const orderTracks = pgTable("order_tracks", {
  inquiryId: text("inquiry_id").primaryKey().references(() => inquiries.id),
  kind: text("kind").notNull(),
  stage: text("stage").notNull(),
  /** Importe acordado con la cliente (centavos de ARS), confirmado por la tienda. null = todavía sin confirmar. */
  agreedMinor: ms("agreed_minor"),
  /** Pedido cancelado (no implica que el dinero esté reintegrado: eso se registra en `order_refunds`). */
  cancelledAt: ms("cancelled_at"),
  /** Hash del enlace privado de seguimiento para invitados (lo comparte el dueño); null = sin enlace. */
  accessTokenHash: text("access_token_hash"),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

/** Línea de tiempo del pedido. `publicText` lo ve la cliente; `internalText` solo el panel. Las fechas son reales (las carga el dueño), nunca por el paso del tiempo. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    /** stage | note | payment | receipt | incident | refund | shipment | delivery | system */
    kind: text("kind").notNull(),
    stage: text("stage"),
    publicText: text("public_text"),
    internalText: text("internal_text"),
    /** Fecha real del hecho (ms). */
    occurredAt: ms("occurred_at").notNull(),
    createdAt: ms("created_at").notNull(),
    actorEmail: text("actor_email"),
    opKey: text("op_key").unique(),
  },
  (t) => [index("order_events_inquiry_idx").on(t.inquiryId, t.occurredAt)],
);

/** Pagos confirmados por el dueño. Un comprobante subido NO crea un pago: lo crea el dueño al confirmar el ingreso. */
export const orderPayments = pgTable(
  "order_payments",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    /** sena | saldo | pago_total | otro */
    kind: text("kind").notNull(),
    amountMinor: ms("amount_minor").notNull(),
    /** transferencia | efectivo | otro */
    method: text("method").notNull(),
    /** confirmado | anulado */
    status: text("status").notNull().default("confirmado"),
    receiptId: text("receipt_id").unique(),
    /** Fecha real del ingreso. */
    paidAt: ms("paid_at").notNull(),
    internalNote: text("internal_note"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: ms("created_at").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    voidedAt: ms("voided_at"),
    voidReason: text("void_reason"),
  },
  (t) => [index("order_payments_inquiry_idx").on(t.inquiryId), check("order_payments_amount_check", sql`${t.amountMinor} > 0`)],
);

/** Comprobantes de transferencia (archivo PRIVADO, nunca en el bucket público de fotos). Subirlo no confirma nada. */
export const paymentReceipts = pgTable(
  "payment_receipts",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    uploadedByUserId: text("uploaded_by_user_id"),
    /** cuenta | invitado | enlace */
    uploaderKind: text("uploader_kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    originalName: text("original_name"),
    /** Lo que la persona dice haber transferido (informativo; no es el pago confirmado). */
    declaredAmountMinor: ms("declared_amount_minor"),
    note: text("note"),
    /** pendiente_revision | aceptado | rechazado */
    status: text("status").notNull().default("pendiente_revision"),
    rejectReason: text("reject_reason"),
    reviewedAt: ms("reviewed_at"),
    reviewedByEmail: text("reviewed_by_email"),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [uniqueIndex("payment_receipts_dup").on(t.inquiryId, t.sha256), index("payment_receipts_inquiry_idx").on(t.inquiryId)],
);

/** Incidentes (paquete perdido, problema que impide cumplir el encargo). */
export const orderIncidents = pgTable(
  "order_incidents",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    /** paquete_perdido | problema_proveedor | danio | otro */
    kind: text("kind").notNull(),
    internalDetail: text("internal_detail"),
    publicText: text("public_text"),
    /** abierto | resuelto */
    status: text("status").notNull().default("abierto"),
    openedAt: ms("opened_at").notNull(),
    resolvedAt: ms("resolved_at"),
    resolution: text("resolution"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("order_incidents_inquiry_idx").on(t.inquiryId)],
);

/** Reintegros: se registran, nunca se ejecutan solos. «Reintegrado» exige fecha, importe y constancia. Cancelar un pedido NO equivale a haber devuelto el dinero. */
export const orderRefunds = pgTable(
  "order_refunds",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    incidentId: text("incident_id").references(() => orderIncidents.id),
    amountMinor: ms("amount_minor").notNull(),
    /** pendiente | reintegrado */
    status: text("status").notNull().default("pendiente"),
    /** Fecha real del reintegro (solo cuando está reintegrado). */
    refundedAt: ms("refunded_at"),
    /** Constancia: número de operación o referencia de la transferencia de devolución. */
    evidence: text("evidence"),
    internalNote: text("internal_note"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("order_refunds_inquiry_idx").on(t.inquiryId), check("order_refunds_amount_check", sql`${t.amountMinor} > 0`)],
);

/** Envíos internacionales agrupados: llevan artículos de varios pedidos. Cada etapa guarda la fecha real que carga el dueño. */
export const shipments = pgTable("shipments", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  supplier: text("supplier"),
  internalNote: text("internal_note"),
  /** preparando | enviado_proveedor | recibido_origen | en_transito | recibido_argentina */
  status: text("status").notNull().default("preparando"),
  sentAt: ms("sent_at"),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  originReceivedAt: ms("origin_received_at"),
  transitAt: ms("transit_at"),
  arrivedAt: ms("arrived_at"),
  createdAt: ms("created_at").notNull(),
  createdByEmail: text("created_by_email").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

export const shipmentItems = pgTable(
  "shipment_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    shipmentId: text("shipment_id").notNull().references(() => shipments.id, { onDelete: "cascade" }),
    lineId: integer("line_id").notNull().references(() => inquiryLines.id),
    quantity: integer("quantity").notNull(),
  },
  (t) => [uniqueIndex("shipment_items_unique").on(t.shipmentId, t.lineId), index("shipment_items_line_idx").on(t.lineId), check("shipment_items_qty_check", sql`${t.quantity} > 0`)],
);

/** Entregas a la cliente (parciales o totales) por artículo. Un pedido solo figura entregado cuando todas sus unidades lo están. */
export const lineDeliveries = pgTable(
  "line_deliveries",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    inquiryId: text("inquiry_id").notNull().references(() => inquiries.id),
    lineId: integer("line_id").notNull().references(() => inquiryLines.id),
    quantity: integer("quantity").notNull(),
    /** envio | retiro */
    method: text("method").notNull(),
    deliveredAt: ms("delivered_at").notNull(),
    publicNote: text("public_note"),
    opKey: text("op_key").notNull().unique(),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: ms("created_at").notNull(),
  },
  (t) => [index("line_deliveries_line_idx").on(t.lineId), check("line_deliveries_qty_check", sql`${t.quantity} > 0`)],
);

/**
 * Cola de avisos por correo. El aviso se encola en la MISMA transacción que el cambio de estado (si el envío falla, el cambio se conserva) y `dedupeKey`
 * impide duplicados. Estados: pendiente · enviado · fallido (se puede reintentar; uno enviado nunca se reenvía).
 */
export const notificationOutbox = pgTable(
  "notification_outbox",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    inquiryId: text("inquiry_id"),
    alertId: text("alert_id"),
    event: text("event").notNull(),
    channel: text("channel").notNull().default("email"),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    /** Enlace del aviso (ver el pedido, cancelar el aviso de reposición). */
    link: text("link"),
    /** pendiente | enviando | enviado | fallido */
    status: text("status").notNull().default("pendiente"),
    attempts: integer("attempts").notNull().default(0),
    /** Reclamo atómico del envío (ms): evita que dos reintentos simultáneos manden el mismo correo. */
    claimedAt: ms("claimed_at"),
    lastError: text("last_error"),
    createdAt: ms("created_at").notNull(),
    sentAt: ms("sent_at"),
  },
  (t) => [index("notification_outbox_status_idx").on(t.status, t.createdAt), index("notification_outbox_inquiry_idx").on(t.inquiryId)],
);

/* ---------- Costos privados (solo panel; nada de esto viaja al navegador público) ---------- */

/** Compra o lote a un proveedor. Confirmada = costos congelados (no se edita). */
export const costPurchases = pgTable("cost_purchases", {
  id: text("id").primaryKey(),
  managedImport: boolean("managed_import").notNull().default(false),
  reference: text("reference"),
  orderedAt: ms("ordered_at"),
  supplier: text("supplier").notNull(),
  purchasedAt: ms("purchased_at").notNull(),
  /** Moneda del precio original: RMB | USD | ARS. */
  currency: text("currency").notNull(),
  /** Cotización usada: pesos por unidad de la moneda × 10.000 (null si la moneda es ARS). */
  rateToArs10k: ms("rate_to_ars_10k"),
  rateNote: text("rate_note"),
  note: text("note"),
  /** borrador | confirmada */
  status: text("status").notNull().default("borrador"),
  confirmedAt: ms("confirmed_at"),
  createdAt: ms("created_at").notNull(),
  createdByEmail: text("created_by_email").notNull(),
});

export const costPurchaseItems = pgTable(
  "cost_purchase_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    purchaseId: text("purchase_id").notNull().references(() => costPurchases.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    /** Precio unitario en la moneda original (centavos de esa moneda). */
    unitPriceOriginalMinor: ms("unit_price_original_minor").notNull(),
    /** Se completan al confirmar: reparto de gastos, costo total puesto en Argentina y costo final por unidad (centavos de ARS). */
    allocatedExpensesMinor: ms("allocated_expenses_minor"),
    totalCostMinor: ms("total_cost_minor"),
    finalUnitCostMinor: ms("final_unit_cost_minor"),
    commercialQuantity: integer("commercial_quantity"),
    commercialCostMinor: ms("commercial_cost_minor"),
  },
  (t) => [index("cost_purchase_items_purchase_idx").on(t.purchaseId), index("cost_purchase_items_product_idx").on(t.productId), check("cost_purchase_items_qty_check", sql`${t.quantity} > 0`)],
);

/** Gasto compartido de la compra con su REGLA de reparto visible: unidades · valor · manual. */
export const costExpenses = pgTable(
  "cost_expenses",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    purchaseId: text("purchase_id").notNull().references(() => costPurchases.id, { onDelete: "cascade" }),
    /** envio | impuestos | otros */
    kind: text("kind").notNull(),
    description: text("description"),
    amountMinor: ms("amount_minor"),
    certainty: text("certainty").notNull().default("definitivo"),
    /** unidades | valor | manual */
    allocation: text("allocation").notNull(),
    /** Solo en `manual`: JSON { "<posición del artículo>": centavos }; debe sumar el importe. */
    manualJson: text("manual_json"),
  },
  (t) => [index("cost_expenses_purchase_idx").on(t.purchaseId), check("cost_expenses_amount_check", sql`
    (${t.certainty} = 'pendiente' and ${t.amountMinor} is null) or
    (${t.certainty} in ('estimado', 'definitivo') and ${t.amountMinor} is not null and ${t.amountMinor} >= 0)`)],
);

/** Destinos de un artículo de compra. Cada fila puede repartirse en varios envíos. */
export const importAllocations = pgTable("import_allocations", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  itemId: integer("item_id").notNull().references(() => costPurchaseItems.id),
  destination: text("destination").notNull(),
  quantity: integer("quantity").notNull(),
  orderLineId: integer("order_line_id").references(() => inquiryLines.id),
  saleLineId: integer("sale_line_id").references(() => saleLines.id),
  visibility: text("visibility").notNull().default("privado"),
  offerMinor: ms("offer_minor"),
}, (t) => [
  index("import_allocations_item_idx").on(t.itemId),
  index("import_allocations_order_idx").on(t.orderLineId),
  check("import_allocations_qty_check", sql`${t.quantity} >= 0 and (${t.quantity} > 0 or ${t.destination} = 'reventa')`),
]);

export const importParcels = pgTable("import_parcels", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  allocationId: integer("allocation_id").notNull().references(() => importAllocations.id),
  shipmentId: text("shipment_id").notNull().references(() => shipments.id),
  quantity: integer("quantity").notNull(),
  accepted: integer("accepted").notNull().default(0),
  missing: integer("missing").notNull().default(0),
  damaged: integer("damaged").notNull().default(0),
  revision: integer("revision").notNull().default(0),
}, (t) => [
  uniqueIndex("import_parcels_shipment_allocation").on(t.shipmentId, t.allocationId),
  index("import_parcels_allocation_idx").on(t.allocationId),
  check("import_parcels_qty_check", sql`${t.quantity} >= 0 and ${t.accepted} >= 0 and ${t.missing} >= 0 and ${t.damaged} >= 0 and ${t.accepted} + ${t.missing} + ${t.damaged} <= ${t.quantity}`),
]);

export const importReceipts = pgTable("import_receipts", {
  operationKey: text("operation_key").primaryKey(),
  parcelId: integer("parcel_id").notNull().references(() => importParcels.id),
  accepted: integer("accepted").notNull(),
  missing: integer("missing").notNull(),
  damaged: integer("damaged").notNull(),
  revision: integer("revision").notNull(),
  reason: text("reason").notNull(),
  occurredAt: ms("occurred_at").notNull(),
  createdAt: ms("created_at").notNull(),
  actorEmail: text("actor_email").notNull(),
}, (t) => [uniqueIndex("import_receipts_parcel_revision").on(t.parcelId, t.revision)]);

/** Una retención de preventa siempre apunta a unidades de un tramo concreto. */
export const importReservations = pgTable("import_reservations", {
  inquiryId: text("inquiry_id").primaryKey().references(() => inquiries.id),
  sourceParcelId: integer("source_parcel_id").notNull().references(() => importParcels.id),
  heldParcelId: integer("held_parcel_id").references(() => importParcels.id),
  quantity: integer("quantity").notNull(),
  unitPriceMinor: ms("unit_price_minor").notNull(),
  expiresAt: ms("expires_at").notNull(),
  releasedAt: ms("released_at"),
}, (t) => [
  index("import_reservations_source_idx").on(t.sourceParcelId),
  uniqueIndex("import_reservations_held_idx").on(t.heldParcelId),
]);

export const importDocuments = pgTable("import_documents", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull().references(() => costPurchases.id),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  createdAt: ms("created_at").notNull(),
}, (t) => [index("import_documents_purchase_idx").on(t.purchaseId)]);

export const importDisbursements = pgTable("import_disbursements", {
  expenseId: text("expense_id").primaryKey().references(() => accountingExpenses.id),
  purchaseId: text("purchase_id").notNull().references(() => costPurchases.id),
}, (t) => [index("import_disbursements_purchase_idx").on(t.purchaseId)]);

/** Reparto verificable de cada gasto entre los artículos (se escribe al confirmar). */
export const costExpenseShares = pgTable(
  "cost_expense_shares",
  {
    expenseId: integer("expense_id").notNull().references(() => costExpenses.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => costPurchaseItems.id, { onDelete: "cascade" }),
    shareMinor: ms("share_minor").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.itemId] })],
);

/**
 * Costo HISTÓRICO aplicado a una línea de venta o de pedido (encargo/mayorista): se congela al registrarse y no cambia con reposiciones ni cotizaciones.
 * Sin fila = «Costo pendiente» (nunca se asume cero). `basis`: promedio_compras (costo promedio de las compras confirmadas en ese momento) · manual.
 */
export const appliedCosts = pgTable(
  "applied_costs",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    /** sale_line | order_line */
    refKind: text("ref_kind").notNull(),
    refId: integer("ref_id").notNull(),
    unitCostMinor: ms("unit_cost_minor").notNull(),
    basis: text("basis").notNull(),
    createdAt: ms("created_at").notNull(),
    createdByEmail: text("created_by_email"),
  },
  (t) => [uniqueIndex("applied_costs_ref").on(t.refKind, t.refId)],
);

/** Comisiones de una venta (p. ej. costo de cobro), cargadas por el dueño. */
export const saleCommissions = pgTable(
  "sale_commissions",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    saleId: text("sale_id").notNull().references(() => sales.id),
    amountMinor: ms("amount_minor").notNull(),
    note: text("note"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: ms("created_at").notNull(),
    createdByEmail: text("created_by_email").notNull(),
  },
  (t) => [index("sale_commissions_sale_idx").on(t.saleId), check("sale_commissions_amount_check", sql`${t.amountMinor} >= 0`)],
);

/* ---------- Catálogo mayorista ---------- */

/**
 * Precio mayorista por tramo de cantidad (en USD, como el precio base del catálogo; se muestra en pesos con la misma conversión). `borrador` lo ve solo el panel;
 * solo `publicado` llega a cuentas aprobadas. Referencia interna conversada: costo final × 1,5 (recargo del 50% sobre costo, no margen sobre venta); el precio lo fija el dueño por tramo.
 */
export const wholesaleTiers = pgTable(
  "wholesale_tiers",
  {
    productId: text("product_id").notNull(),
    minQty: integer("min_qty").notNull(),
    unitPriceUsdMinor: integer("unit_price_usd_minor").notNull(),
    /** borrador | publicado */
    state: text("state").notNull().default("borrador"),
    updatedAt: ms("updated_at").notNull(),
    updatedByEmail: text("updated_by_email").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.minQty] }), check("wholesale_tiers_check", sql`${t.minQty} >= 1 and ${t.unitPriceUsdMinor} > 0`)],
);
