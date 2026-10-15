/**
 * Conversión USD → ARS y reglas de la cotización. Todo es aritmética entera (sin floats) y vive en UN solo lugar:
 * catálogo, filtros, carrito, consultas y panel usan estas funciones.
 *
 * Unidades:
 *  - Dinero USD en centavos de dólar enteros (`usdMinor`; USD 10,00 = 1000).
 *  - Dinero ARS en centavos de peso enteros (`priceMinor`; $12.300 = 1_230_000).
 *  - Cotización «pesos por dólar» como entero × 10.000 (`rate10k`; 1.234,50 = 12_345_000). Cuatro decimales sobran:
 *    el proveedor publica a lo sumo dos.
 *
 * Regla de precio unitario (acordada con el dueño):
 *   precioARS = redondearAlMúltiploDe100(precioUSD × cotizaciónBlueVenta)
 * al múltiplo de $100 más cercano, con las mitades hacia arriba (importes positivos). Un precio USD positivo nunca da $0:
 * el mínimo es $100.
 */
export const RATE_SCALE = 10_000;
/** Los precios unitarios en pesos son múltiplos de este valor. */
export const PRICE_STEP_PESOS = 100;
/** Rango de cotizaciones aceptables (pesos por dólar): fuera de él se considera un dato erróneo. */
export const RATE_MIN = 1;
export const RATE_MAX = 1_000_000;

/** Convierte un número de cotización a su entero escalado, o null si no es válido (no positivo, no finito o fuera de rango). */
export function toRate10k(rate: unknown): number | null {
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < RATE_MIN || rate > RATE_MAX) return null;
  const scaled = Math.round(rate * RATE_SCALE);
  return Number.isSafeInteger(scaled) && scaled > 0 ? scaled : null;
}

/** Interpreta lo que escribe una persona («1.425,50», «1425,5», «1425.5»). Devuelve null si no es un número claro. */
export function parseRateInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(/^\$/, "");
  if (!t) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d+)?$/.test(t)) normalized = t.replace(",", ".");
  else if (/^\d+(\.\d+)?$/.test(t)) normalized = t;
  else return null;
  return toRate10k(Number(normalized)) === null ? null : Number(normalized);
}

export const rateFrom10k = (rate10k: number): number => rate10k / RATE_SCALE;

/**
 * Precio unitario en centavos de peso a partir de centavos de dólar y la cotización escalada.
 * Exacto: usa BigInt porque usdMinor × rate10k puede superar 2^53.
 */
export function usdToArsMinor(usdMinor: number, rate10k: number): number | null {
  if (!Number.isSafeInteger(usdMinor) || usdMinor <= 0 || !Number.isSafeInteger(rate10k) || rate10k <= 0) return null;
  // centavos ARS exactos = usdMinor × rate10k / RATE_SCALE ; el múltiplo de $100 equivale a 100 × 100 centavos = 10.000.
  const stepMinor = BigInt(PRICE_STEP_PESOS * 100);
  const numerator = BigInt(usdMinor) * BigInt(rate10k);
  const denominator = BigInt(RATE_SCALE) * stepMinor;
  const steps = (numerator * 2n + denominator) / (denominator * 2n); // redondeo a entero, mitades hacia arriba
  const result = (steps < 1n ? 1n : steps) * stepMinor;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}

const usdFormat = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «USD 10,00». */
export const formatUSD = (usdMinor: number): string => `USD ${usdFormat.format(usdMinor / 100)}`;
const rateFormat = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «$ 1.234,50» (mismo estilo que los precios en pesos, con centavos porque una cotización los tiene). */
export const formatRate = (rate10k: number): string => rateFormat.format(rate10k / RATE_SCALE);

/** Interpreta dólares escritos por una persona («10», «10,5», «10.50», «1.250,75») → centavos USD, o null. */
export function parseUsdInput(text: string): number | null {
  const t = text.trim().replace(/\s/g, "").replace(/^USD/i, "").replace(/^U\$S/i, "").replace(/^\$/, "");
  if (!t) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(t)) normalized = t.replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(t)) normalized = t;
  else return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000 ? cents : null;
}

/** Texto editable de un importe USD en centavos («10,50»). */
export const usdInputText = (usdMinor: number | null): string => (usdMinor === null ? "" : usdFormat.format(usdMinor / 100));

/* ------------------------------------------------------------------ cotización vigente ------------------------------------------------------------------ */

export const HOUR = 3_600_000;
/** Cada cuánto se consulta al proveedor (criterio técnico de partida). */
export const REFRESH_INTERVAL_MS = 15 * 60_000;
/** Hasta esta antigüedad (desde la última consulta exitosa) la cotización automática se usa sin aviso. */
export const FRESH_MAX_AGE_MS = 2 * HOUR;
/** Pasada esta antigüedad NO se convierte: el precio en pesos queda pendiente. Entre FRESH y este tope se usa con aviso visible. */
export const USABLE_MAX_AGE_MS = 24 * HOUR;
/**
 * Si el proveedor sigue respondiendo pero su propia fecha de publicación es más vieja que esto, la cotización se considera sin
 * vigencia (cubre fines de semana largos). Es la fecha de PUBLICACIÓN del proveedor, distinta de la fecha de nuestra consulta.
 */
export const PROVIDER_MAX_AGE_MS = 5 * 24 * HOUR;
/** Una cotización manual más vieja que esto se marca como «a revisar» (sigue vigente: la elige el dueño). */
export const MANUAL_REVIEW_AGE_MS = 7 * 24 * HOUR;
/** Un valor automático que difiere más que esto de la última cotización válida se rechaza como sospechoso (50%). */
export const MAX_JUMP_RATIO = 1.5;

export type FxStoredState = {
  mode: "auto" | "manual";
  autoRate10k: number | null;
  /** Fecha de publicación que informa el proveedor (ms). NO es cuándo la consultamos. */
  autoProviderUpdatedAt: number | null;
  /** Última consulta EXITOSA al proveedor (ms). */
  autoFetchedAt: number | null;
  manualRate10k: number | null;
  manualSetAt: number | null;
};

export type FxStatus =
  /** Sin ninguna cotización utilizable (nunca se obtuvo, venció o es inválida). */
  | "none"
  /** Automática, consultada hace poco. */
  | "fresh"
  /** Automática usable pero vieja (la última consulta exitosa no es reciente): se usa con aviso. */
  | "stale"
  /** Automática demasiado vieja o del proveedor sin vigencia: no se convierte. */
  | "expired"
  /** Manual elegida por el dueño. */
  | "manual";

export type EffectiveRate = {
  status: FxStatus;
  mode: "auto" | "manual";
  /** Cotización con la que se convierte. null = no se convierte (precio ARS pendiente). */
  rate10k: number | null;
  /** Cuándo se obtuvo/estableció el valor usado (ms): consulta exitosa, o fecha en que se fijó la manual. */
  asOf: number | null;
  /** Fecha de publicación del proveedor (solo automática). */
  providerUpdatedAt: number | null;
  /** Texto corto de la fuente. */
  source: string;
  /** true si hay que avisar al visitante (vieja pero usable). */
  warn: boolean;
};

export const AUTO_SOURCE = "Dólar blue (venta) · DolarAPI";
export const MANUAL_SOURCE = "Dólar blue (venta) · valor manual fijado por la tienda";

/** Decide qué cotización rige ahora. Función pura: el estado y la hora entran por parámetro. */
export function evaluateRate(s: FxStoredState, now: number): EffectiveRate {
  if (s.mode === "manual") {
    const ok = s.manualRate10k !== null && s.manualRate10k > 0;
    return { status: ok ? "manual" : "none", mode: "manual", rate10k: ok ? s.manualRate10k : null, asOf: s.manualSetAt, providerUpdatedAt: null, source: MANUAL_SOURCE, warn: false };
  }
  const base = { mode: "auto" as const, asOf: s.autoFetchedAt, providerUpdatedAt: s.autoProviderUpdatedAt, source: AUTO_SOURCE };
  if (s.autoRate10k === null || s.autoRate10k <= 0 || s.autoFetchedAt === null) return { ...base, status: "none", rate10k: null, warn: false };
  const age = now - s.autoFetchedAt;
  const providerAge = s.autoProviderUpdatedAt === null ? 0 : now - s.autoProviderUpdatedAt;
  if (age > USABLE_MAX_AGE_MS || providerAge > PROVIDER_MAX_AGE_MS) return { ...base, status: "expired", rate10k: null, warn: false };
  if (age > FRESH_MAX_AGE_MS) return { ...base, status: "stale", rate10k: s.autoRate10k, warn: true };
  return { ...base, status: "fresh", rate10k: s.autoRate10k, warn: false };
}

/** ¿El valor automático nuevo es razonable frente al último válido? (cambios de más del 50% se rechazan) */
export function isPlausibleJump(previous10k: number | null, next10k: number): boolean {
  if (previous10k === null || previous10k <= 0) return true;
  const ratio = next10k / previous10k;
  return ratio <= MAX_JUMP_RATIO && ratio >= 1 / MAX_JUMP_RATIO;
}

/** «hace 3 h», «hace 20 min» (para mostrar antigüedad real). */
export function ageLabel(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}

/**
 * Cuotas sin interés: reparte el total en `n` partes enteras cuya suma es EXACTAMENTE el total (el residuo se distribuye de a un
 * centavo desde la primera cuota). No se redondea cada cuota por separado.
 */
export function splitInstallments(totalMinor: number, n: number): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0 || !Number.isInteger(n) || n < 1) return [];
  const base = Math.floor(totalMinor / n);
  const rest = totalMinor - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}
