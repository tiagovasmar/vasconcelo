import "server-only";
import { cache } from "react";
import { getTableColumns, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getDb, type Db } from "@/db/client";
import { adminSettings, fxSettings, productGalleries, productOverrides } from "@/db/schema";
import { LOW_STOCK_KEY } from "@/features/admin/settings";
import type { GalleryRow, OverrideRow } from "./overrides";
import type { FxRow } from "@/features/fx/service";

/**
 * Lo que casi toda página pública necesita para armar el catálogo, leído con UNA sola consulta (antes eran cuatro, una detrás de otra): valores del panel por producto,
 * galerías elegidas, fila de la cotización y umbral de «Bajo stock». La conexión es una sola por instancia y atiende de a una consulta; con la base a decenas de milisegundos
 * (Supabase desde una función) cada consulta de más cuesta dos idas y vueltas. Los datos son exactamente los mismos y siguen leyéndose en cada pedido: nada se memoriza entre pedidos.
 */
export type PageData = {
  overrides: Map<string, OverrideRow>;
  galleries: Map<string, GalleryRow>;
  /** null si la fila de cotización todavía no existe (la crea `currentRate`). */
  fxRow: FxRow | null;
  /** Valor guardado del umbral de «Bajo stock» (null = sin valor propio: rige el predeterminado). */
  lowStockRow: typeof adminSettings.$inferSelect | null;
};

/** Convierte una fila `row_to_json` (nombres de columna de la base) en la fila que devolvería Drizzle (nombres de campo y conversión de cada tipo). */
function fromJson<T>(table: PgTable, json: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [field, col] of Object.entries(getTableColumns(table))) {
    const v = json[col.name];
    out[field] = v === null || v === undefined ? null : typeof col.mapFromDriverValue === "function" ? col.mapFromDriverValue(v) : v;
  }
  return out as T;
}

export async function loadPageData(db: Db): Promise<PageData> {
  const rows = (await db.execute(sql`
    select
      (select coalesce(json_agg(t), '[]'::json) from product_overrides t) as overrides,
      (select coalesce(json_agg(t), '[]'::json) from product_galleries t) as galleries,
      (select row_to_json(t) from fx_settings t where t.id = 1) as fx,
      (select row_to_json(t) from admin_settings t where t.key = ${LOW_STOCK_KEY}) as low`)) as unknown as Array<{ overrides: Array<Record<string, unknown>>; galleries: Array<Record<string, unknown>>; fx: Record<string, unknown> | null; low: Record<string, unknown> | null }>;
  const r = rows[0];
  return {
    overrides: new Map(r.overrides.map((o) => fromJson<OverrideRow>(productOverrides, o)).map((o) => [o.productId, o])),
    galleries: new Map(r.galleries.map((g) => fromJson<GalleryRow>(productGalleries, g)).map((g) => [g.productId, g])),
    fxRow: r.fx ? fromJson<FxRow>(fxSettings, r.fx) : null,
    lowStockRow: r.low ? fromJson<typeof adminSettings.$inferSelect>(adminSettings, r.low) : null,
  };
}

/** Una sola lectura por pedido de página (`cache` de React: dura lo que dura ese pedido). */
export const pageDataOncePerRequest = cache(() => loadPageData(getDb()));
