import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/** Consultas preparadas: snapshot inmutable de lo que el servidor validó (no se actualizan precios después). */
export const inquiries = sqliteTable(
  "inquiries",
  {
    /** Referencia pública no secuencial (p. ej. TT-7K3M9QX2). */
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    contentHash: text("content_hash").notNull(),
    /** Hash del token de la sesión de invitado que la creó; el token viaja en una cookie httpOnly. */
    sessionTokenHash: text("session_token_hash").notNull(),
    /** Solo se completa desde la sesión autenticada (hito 4), nunca desde el body. */
    userId: text("user_id"),
    status: text("status").notNull().default("consulta_preparada"),
    currency: text("currency").notNull(),
    /** Subtotal de los productos DISPONIBLES (los que se encargan no suman importe) antes de descuentos. */
    subtotalMinor: integer("subtotal_minor").notNull(),
    /** Descuento por transferencia (10%, solo con al menos una caja), en centavos. 0 = sin descuento. */
    discountMinor: integer("discount_minor").notNull().default(0),
    /** Cotización con la que se convirtieron los precios USD de esta consulta (instantánea; una actualización del dólar NO la reescribe). */
    fxRate10k: integer("fx_rate_10k"),
    /** auto | manual */
    fxMode: text("fx_mode"),
    fxSource: text("fx_source"),
    /** Fecha (ms) del dato de cotización usado (consulta exitosa o fecha de carga manual). */
    fxAsOf: integer("fx_as_of"),
    deliveryMethod: text("delivery_method").notNull(),
    deliveryJson: text("delivery_json").notNull(),
    paymentPreference: text("payment_preference").notNull(),
    contactName: text("contact_name"),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("inquiries_session_idx").on(t.sessionTokenHash), index("inquiries_user_idx").on(t.userId)],
);

export const inquiryLines = sqliteTable(
  "inquiry_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    language: text("language").notNull(),
    quantity: integer("quantity").notNull(),
    /** stock = disponible, con precio del catálogo · encargo = consulta por encargo: SIN precio ni cotización (importes en 0 = «no cotizado»). */
    fulfillment: text("fulfillment").notNull().default("stock"),
    /** Precio base en USD (centavos) vigente al preparar la consulta; null en encargos o productos sin precio USD. */
    unitPriceUsdMinor: integer("unit_price_usd_minor"),
    unitPriceMinor: integer("unit_price_minor").notNull(),
    lineSubtotalMinor: integer("line_subtotal_minor").notNull(),
  },
  (t) => [index("inquiry_lines_inquiry_idx").on(t.inquiryId)],
);

/** Límites de uso persistentes (sobreviven reinicios; válidos para un servidor único). */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});
/**
 * Valores comerciales administrados desde /admin. Si existe una fila, sus cuatro campos REEMPLAZAN a los del catálogo por código
 * (`commercial.json`), incluido «pendiente» (NULL); si no existe, rige el valor del código. Borrar la fila = volver al código.
 */
export const productOverrides = sqliteTable("product_overrides", {
  productId: text("product_id").primaryKey(),
  /**
   * LEGADO (anterior a la tanda 6): precio fijo en centavos de ARS cargado a mano. Ya NO rige: el precio base es `priceUsdMinor`.
   * Se conserva intacto como dato anterior que el panel muestra; nunca se convierte retroactivamente con una cotización.
   */
  priceMinor: integer("price_minor"),
  /** Precio base en centavos de USD (USD 10,00 = 1000). NULL = precio pendiente (no es USD 0). */
  priceUsdMinor: integer("price_usd_minor"),
  /** Título editado (NULL = el del catálogo por código). */
  title: text("title"),
  /** Descripción breve editada (NULL = la del catálogo por código). */
  description: text("description"),
  /** true = disponible solo por encargo (no se vende de stock; se consulta y se cotiza con la tienda). */
  orderOnly: integer("order_only", { mode: "boolean" }).notNull().default(false),
  /** Unidades disponibles. NULL = stock pendiente (no es agotado); 0 = agotado. */
  stockQuantity: integer("stock_quantity"),
  /** Máximo por pedido. NULL = sin tope propio (rige el técnico). */
  maxPerOrder: integer("max_per_order"),
  /** false = oculto: no aparece en el catálogo, ni en la ficha, ni se puede consultar. */
  visible: integer("visible", { mode: "boolean" }).notNull().default(true),
  /** Versión para detectar ediciones simultáneas (ms de la última modificación). */
  updatedAt: integer("updated_at").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
});

/** Historial de cambios: una fila por dato modificado, con quién, cuándo y los valores anterior y nuevo (JSON). Nunca se edita. */
export const productAudit = sqliteTable(
  "product_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: text("product_id").notNull(),
    sku: text("sku").notNull(),
    /** price_minor | stock_quantity | max_per_order | visible | reset */
    field: text("field").notNull(),
    oldValue: text("old_value").notNull(),
    newValue: text("new_value").notNull(),
    userId: text("user_id").notNull(),
    userEmail: text("user_email").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("product_audit_product_idx").on(t.productId), index("product_audit_created_idx").on(t.createdAt)],
);

/**
 * Solicitudes de cuenta mayorista: una por usuario (clave única, sin duplicados). Quedan «pendiente» hasta que el dueño defina las políticas
 * (compra mínima, acumulación con otros descuentos y aprobación); guardar la solicitud NO activa ningún beneficio.
 */
export const wholesaleRequests = sqliteTable(
  "wholesale_requests",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().unique().references(() => user.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    locality: text("locality").notNull(),
    province: text("province").notNull(),
    note: text("note"),
    /** pendiente | aprobada | rechazada. Hoy solo «pendiente»: ver mayorista.activationEnabled. */
    status: text("status").notNull().default("pendiente"),
    createdAt: integer("created_at").notNull(),
    reviewedAt: integer("reviewed_at"),
    reviewedByEmail: text("reviewed_by_email"),
  },
  (t) => [index("wholesale_requests_status_idx").on(t.status)],
);

/** Un único registro (id = 1) con la configuración y el estado de la cotización del dólar. */
export const fxSettings = sqliteTable("fx_settings", {
  id: integer("id").primaryKey(),
  /** auto = se consulta al proveedor · manual = rige el valor fijado por el dueño hasta que vuelva a automático. */
  mode: text("mode").notNull().default("auto"),
  autoRate10k: integer("auto_rate_10k"),
  /** Fecha de publicación que informa el proveedor (ms). Distinta de la fecha de consulta. */
  autoProviderUpdatedAt: integer("auto_provider_updated_at"),
  /** Última consulta exitosa (ms). */
  autoFetchedAt: integer("auto_fetched_at"),
  /** Último intento (exitoso o no), para espaciar las consultas. */
  lastAttemptAt: integer("last_attempt_at"),
  lastError: text("last_error"),
  lastErrorAt: integer("last_error_at"),
  manualRate10k: integer("manual_rate_10k"),
  manualSetAt: integer("manual_set_at"),
  manualSetByEmail: text("manual_set_by_email"),
  manualNote: text("manual_note"),
  updatedAt: integer("updated_at").notNull(),
});

/** Historial de la cotización: cambios del valor automático, errores, valor manual y cambios de modo. Nunca se edita. */
export const fxLog = sqliteTable(
  "fx_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** auto_rate | auto_error | manual_rate | mode */
    kind: text("kind").notNull(),
    rate10k: integer("rate_10k"),
    /** Modo resultante (auto | manual). */
    mode: text("mode"),
    detail: text("detail"),
    /** Quién (correo del administrador); null para consultas automáticas. */
    userEmail: text("user_email"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("fx_log_created_idx").on(t.createdAt)],
);

/** Archivos de imagen subidos desde el panel (se guardan en disco persistente; acá solo su registro). */
export const mediaAssets = sqliteTable(
  "media_assets",
  {
    /** Nombre seguro generado por el servidor (hash + extensión), nunca el del usuario. */
    id: text("id").primaryKey(),
    sha256: text("sha256").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    hasAlpha: integer("has_alpha", { mode: "boolean" }).notNull(),
    originalName: text("original_name"),
    uploadedByEmail: text("uploaded_by_email").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("media_assets_sha_idx").on(t.sha256)],
);

/**
 * Galería elegida desde el panel para un producto: lista ORDENADA completa (la primera es la portada). Si hay fila, REEMPLAZA a la
 * galería del catálogo por código (que no se modifica); borrarla vuelve a la del código. Los importadores no la tocan.
 */
export const productGalleries = sqliteTable("product_galleries", {
  productId: text("product_id").primaryKey(),
  /** JSON: [{ src, alt, view?, source?, width, height, opaque?, origin, license, status }] */
  itemsJson: text("items_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
});

export * from "./auth-schema";

/** Marcas de operaciones que deben ejecutarse UNA sola vez (p. ej. la inicialización del stock en 0): si la marca existe, no se repite. */
export const systemFlags = sqliteTable("system_flags", {
  key: text("key").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
  note: text("note"),
});

/** Ajustes del panel del dueño (clave → valor de texto): p. ej. el umbral del aviso de stock bajo. Solo los escribe el administrador. */
export const adminSettings = sqliteTable("admin_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
  updatedByEmail: text("updated_by_email").notNull(),
});
