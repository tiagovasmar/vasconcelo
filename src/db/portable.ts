import { createHash } from "node:crypto";
import type postgres from "postgres";

/**
 * Transporte de datos entre bases (respaldo/restauración y migración desde SQLite). Usa SQL directo sobre la conexión de postgres.js para que
 * las filas viajen tal cual (columnas y valores), sin pasar por el catálogo ni por reglas de negocio.
 */
export type TableSpec = {
  name: string;
  /** Columnas de la clave primaria (para ordenar y para `ON CONFLICT DO NOTHING`). */
  pk: string[];
  /** Columna con identidad (autoincremental): al importar se conservan los ids y se reajusta la secuencia. */
  identity?: string;
  /** Datos volátiles (sesiones, tokens de un solo uso, contadores de límite): no se incluyen en respaldos ni migraciones salvo pedido expreso. */
  volatile?: boolean;
  /** Tabla agregada después del primer respaldo: un respaldo anterior que no la trae sigue siendo válido. */
  optional?: boolean;
};

/** En orden de dependencias (las tablas «padre» primero). */
export const TABLES: TableSpec[] = [
  { name: "user", pk: ["id"] },
  { name: "account", pk: ["id"] },
  { name: "session", pk: ["id"], volatile: true },
  { name: "verification", pk: ["id"], volatile: true },
  { name: "rate_limit", pk: ["id"], volatile: true },
  { name: "favorites", pk: ["user_id", "product_id"] },
  { name: "inquiries", pk: ["id"] },
  { name: "inquiry_lines", pk: ["id"], identity: "id" },
  { name: "inquiry_events", pk: ["id"], identity: "id", optional: true },
  { name: "rate_limits", pk: ["key"], volatile: true },
  { name: "product_overrides", pk: ["product_id"] },
  { name: "product_audit", pk: ["id"], identity: "id" },
  { name: "sales", pk: ["id"], optional: true },
  { name: "sale_lines", pk: ["id"], identity: "id", optional: true },
  { name: "stock_movements", pk: ["id"], identity: "id", optional: true },
  { name: "inquiry_sales", pk: ["id"], identity: "id", optional: true },
  { name: "wholesale_requests", pk: ["id"] },
  { name: "fx_settings", pk: ["id"] },
  { name: "fx_log", pk: ["id"], identity: "id" },
  { name: "media_assets", pk: ["id"] },
  { name: "product_galleries", pk: ["product_id"] },
  { name: "system_flags", pk: ["key"] },
  { name: "admin_settings", pk: ["key"] },
  { name: "restock_alerts", pk: ["id"], optional: true },
  { name: "order_tracks", pk: ["inquiry_id"], optional: true },
  { name: "wholesale_order_costs", pk: ["id"], optional: true },
  { name: "order_events", pk: ["id"], identity: "id", optional: true },
  { name: "order_payments", pk: ["id"], optional: true },
  { name: "payment_receipts", pk: ["id"], optional: true },
  { name: "order_incidents", pk: ["id"], optional: true },
  { name: "order_refunds", pk: ["id"], optional: true },
  { name: "shipments", pk: ["id"], optional: true },
  { name: "shipment_items", pk: ["id"], identity: "id", optional: true },
  { name: "line_deliveries", pk: ["id"], identity: "id", optional: true },
  { name: "notification_outbox", pk: ["id"], identity: "id", optional: true },
  { name: "cost_purchases", pk: ["id"], optional: true },
  { name: "cost_purchase_items", pk: ["id"], identity: "id", optional: true },
  { name: "cost_expenses", pk: ["id"], identity: "id", optional: true },
  { name: "cost_expense_shares", pk: ["expense_id", "item_id"], optional: true },
  { name: "applied_costs", pk: ["id"], identity: "id", optional: true },
  { name: "sale_commissions", pk: ["id"], identity: "id", optional: true },
  { name: "wholesale_tiers", pk: ["product_id", "min_qty"], optional: true },
  { name: "accounting_expenses", pk: ["id"], optional: true },
  { name: "import_allocations", pk: ["id"], identity: "id", optional: true },
  { name: "import_parcels", pk: ["id"], identity: "id", optional: true },
  { name: "import_receipts", pk: ["operation_key"], optional: true },
  { name: "import_documents", pk: ["id"], optional: true },
  { name: "import_disbursements", pk: ["expense_id"], optional: true },
  { name: "import_reservations", pk: ["inquiry_id"], optional: true },
  { name: "storefront_visits", pk: ["day", "browser"], optional: true },
];

export const dataTables = (withVolatile = false) => TABLES.filter((t) => withVolatile || !t.volatile);

export type Column = { name: string; type: string };

/** Columnas de una tabla (nombre y tipo de PostgreSQL) en su orden. */
export async function columnsOf(sql: postgres.Sql, table: string): Promise<Column[]> {
  const rows = await sql<{ column_name: string; data_type: string }[]>`
    select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = ${table} order by ordinal_position`;
  return rows.map((r) => ({ name: r.column_name, type: r.data_type }));
}

/** Valor «canónico» (texto estable) para comparar una celda sin importar de qué base vino. */
export function canonical(type: string, v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (type === "boolean") return v === true || v === 1 || v === "t" || v === "true" || v === "1" ? "t" : "f";
  if (type === "timestamp with time zone" || type === "timestamp without time zone") {
    const d = v instanceof Date ? v : typeof v === "number" ? new Date(v) : new Date(String(v));
    return d.toISOString();
  }
  if (type === "bigint" || type === "integer" || type === "smallint") return String(Number(v));
  return String(v);
}

export type TableFingerprint = { rows: number; sha256: string };

/** Huella de una tabla: cantidad de filas y SHA-256 de sus filas canónicas ordenadas por clave primaria. */
export function fingerprint(spec: TableSpec, cols: Column[], rows: Array<Record<string, unknown>>): TableFingerprint {
  const lines = rows.map((r) => {
    const cells = cols.map((c) => canonical(c.type, r[c.name]));
    const key = spec.pk.map((k) => canonical(cols.find((c) => c.name === k)!.type, r[k]) ?? "").join("\u0001");
    return { key, line: JSON.stringify(cells) };
  });
  lines.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { rows: rows.length, sha256: createHash("sha256").update(lines.map((l) => l.line).join("\n")).digest("hex") };
}

/** Lee todas las filas de una tabla de PostgreSQL. */
export async function readTable(sql: postgres.Sql, table: string): Promise<Array<Record<string, unknown>>> {
  return (await sql.unsafe(`select * from "${table}"`)) as unknown as Array<Record<string, unknown>>;
}

/** Serializa una fila a JSON-compatible (fechas en ISO). Los bigint llegan como texto desde postgres.js y se conservan así. */
export function toJsonRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

/**
 * Inserta filas sin pisar las existentes (`ON CONFLICT DO NOTHING`). Devuelve cuántas filas se insertaron de verdad.
 * Reintentar es seguro: lo que ya está en el destino (incluidos cambios posteriores del administrador) no se toca.
 */
export async function insertRows(sql: postgres.Sql, spec: TableSpec, cols: Column[], rows: Array<Record<string, unknown>>): Promise<number> {
  if (!rows.length) return 0;
  const names = cols.map((c) => c.name);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const tuples = chunk.map((r) => `(${names.map((n) => { params.push(r[n] ?? null); return `$${params.length}`; }).join(", ")})`);
    const res = await sql.unsafe(
      `insert into "${spec.name}" (${names.map((n) => `"${n}"`).join(", ")}) values ${tuples.join(", ")} on conflict do nothing returning 1`,
      params as never[],
    );
    inserted += res.length;
  }
  return inserted;
}

/** Tras importar ids explícitos, la secuencia debe seguir desde el máximo (si no, la próxima fila nueva chocaría con un id existente). */
export async function resetIdentity(sql: postgres.Sql, spec: TableSpec): Promise<void> {
  if (!spec.identity) return;
  await sql.unsafe(
    `select setval(pg_get_serial_sequence('"${spec.name}"', '${spec.identity}'), coalesce((select max("${spec.identity}") from "${spec.name}"), 1), (select max("${spec.identity}") is not null from "${spec.name}"))`,
  );
}
