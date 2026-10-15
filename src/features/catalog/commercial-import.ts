/**
 * Importa los datos comerciales (precio ARS y stock por SKU) desde la tabla `datos/precios-y-stock.csv`.
 * Columnas: sku;coleccion;formato;idioma;precio_ars;stock_unidades;estado_del_sellado;observaciones  (separador «;»).
 * Una celda vacía significa DESCONOCIDO (pendiente), nunca cero. Precio y stock de cada SKU son independientes.
 */
export type CommercialItem = { priceMinor: number | null; stockQuantity: number | null; ownerSealCondition: string | null; maxPerOrder?: number };
export type ImportResult = { items: Record<string, CommercialItem>; errors: string[]; warnings: string[]; rows: number };

const REQUIRED = ["sku", "precio_ars", "stock_unidades"];

/** «9500» · «9.500» · «$ 9.500» · «9.500,50» · «9500,5» → centavos enteros; null si está vacío; lanza si es ambiguo o inválido. */
export function parsePriceToMinor(raw: string): number | null {
  const t = raw.replace(/\$|\s|ARS/gi, "");
  if (t === "") return null;
  let normalized: string;
  if (t.includes(",")) {
    const [int, dec, ...rest] = t.split(",");
    if (rest.length || !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(int) || !/^\d{1,2}$/.test(dec)) throw new Error(`precio con formato inválido: «${raw}»`);
    normalized = `${int.replace(/\./g, "")}.${dec}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normalized = t.replace(/\./g, "");
  else if (/^\d+$/.test(t)) normalized = t;
  else throw new Error(`precio ambiguo o inválido: «${raw}» (usá, por ejemplo, 9500 o 9.500 o 9.500,50)`);
  const minor = Math.round(Number(normalized) * 100);
  if (!Number.isFinite(minor) || minor <= 0) throw new Error(`el precio debe ser mayor que 0: «${raw}» (si todavía no lo sabés, dejá la celda vacía)`);
  return minor;
}

export function parseStock(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) throw new Error(`stock inválido: «${raw}» (número entero de unidades; vacío = pendiente)`);
  return Number(t);
}

export function parseCommercialCsv(text: string, knownSkus: string[]): ImportResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const items: Record<string, CommercialItem> = {};
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { items, errors: ["el archivo está vacío"], warnings, rows: 0 };
  const header = lines[0].split(";").map((h) => h.trim().toLowerCase());
  for (const col of REQUIRED) if (!header.includes(col)) errors.push(`falta la columna «${col}» (separador «;»)`);
  if (errors.length) return { items, errors, warnings, rows: 0 };
  const idx = (name: string) => header.indexOf(name);
  const seen = new Set<string>();
  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(";").map((c) => c.trim());
    const at = `fila ${i + 2}`;
    const sku = cells[idx("sku")] ?? "";
    if (!sku) {
      errors.push(`${at}: falta el SKU`);
      continue;
    }
    if (!knownSkus.includes(sku)) {
      errors.push(`${at}: el SKU «${sku}» no existe en el catálogo`);
      continue;
    }
    if (seen.has(sku)) {
      errors.push(`${at}: el SKU «${sku}» está repetido`);
      continue;
    }
    seen.add(sku);
    let priceMinor: number | null = null;
    let stockQuantity: number | null = null;
    try {
      priceMinor = parsePriceToMinor(cells[idx("precio_ars")] ?? "");
    } catch (e) {
      errors.push(`${at} (${sku}): ${(e as Error).message}`);
    }
    try {
      stockQuantity = parseStock(cells[idx("stock_unidades")] ?? "");
    } catch (e) {
      errors.push(`${at} (${sku}): ${(e as Error).message}`);
    }
    const sealIdx = idx("estado_del_sellado");
    const seal = sealIdx >= 0 ? (cells[sealIdx] ?? "") : "";
    if (priceMinor !== null || stockQuantity !== null || seal) {
      items[sku] = { priceMinor, stockQuantity, ownerSealCondition: seal || null };
      if (priceMinor === null || stockQuantity === null) warnings.push(`${sku}: queda pendiente (${priceMinor === null ? "precio" : "stock"} vacío): no se podrá consultar con importe`);
    }
  }
  for (const sku of knownSkus) if (!seen.has(sku)) warnings.push(`${sku}: no figura en el archivo (queda como estaba)`);
  return { items, errors, warnings, rows: lines.length - 1 };
}
