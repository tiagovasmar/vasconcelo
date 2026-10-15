import { and, desc, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { fxLog, fxSettings } from "@/db/schema";
import { evaluateRate, isPlausibleJump, REFRESH_INTERVAL_MS, toRate10k, type EffectiveRate, type FxStoredState } from "./convert";

/**
 * Cotización del dólar blue (venta), compartida por toda la tienda: se consulta al proveedor UNA vez cada 15 minutos (no por visitante
 * ni por tarjeta) y se guarda en la base. Ver docs/COTIZACION.md.
 *
 * - Automático: se usa la última consulta exitosa mientras sea reciente (ver `evaluateRate`); si el proveedor falla se conserva la
 *   última cotización válida, se informa el error y, si pasa demasiado tiempo, el precio en pesos queda pendiente (nunca se inventa ni se usa 0).
 * - Manual: el dueño fija un valor; rige hasta que vuelva a automático. Nunca se reemplaza solo.
 * - La actualización NO depende de un proceso encendido (el sitio corre en funciones serverless): la hace el primer pedido que encuentra la
 *   cotización vencida (`currentRate`), con un tiempo máximo corto; también la dispara `/api/fx/refresh` (tarea programada opcional con
 *   CRON_SECRET), el botón del panel y `npm run fx:refresh`. Varias instancias no consultan a la vez: la primera que «reclama» el intento en
 *   la base (UPDATE condicional sobre `last_attempt_at`) consulta; el resto usa el valor guardado.
 */
export const DEFAULT_PROVIDER_URL = "https://dolarapi.com/v1/dolares/blue";
export const providerUrl = () => process.env.FX_PROVIDER_URL?.trim() || DEFAULT_PROVIDER_URL;
/** FX_AUTO_REFRESH=0 desactiva TODA consulta de red (pruebas, entornos sin salida a internet). */
export const autoRefreshEnabled = () => process.env.FX_AUTO_REFRESH !== "0";

export type FxRow = typeof fxSettings.$inferSelect;
export type Actor = { id: string; email: string };
export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

async function ensureRow(db: Db, now: number): Promise<FxRow> {
  const [row] = await db.select().from(fxSettings).where(eq(fxSettings.id, 1));
  if (row) return row;
  await db.insert(fxSettings).values({ id: 1, mode: "auto", updatedAt: now }).onConflictDoNothing();
  const [created] = await db.select().from(fxSettings).where(eq(fxSettings.id, 1));
  return created;
}

export const getFxRow = (db: Db, now = Date.now()): Promise<FxRow> => ensureRow(db, now);

const storedOf = (r: FxRow): FxStoredState => ({
  mode: r.mode === "manual" ? "manual" : "auto",
  autoRate10k: r.autoRate10k,
  autoProviderUpdatedAt: r.autoProviderUpdatedAt,
  autoFetchedAt: r.autoFetchedAt,
  manualRate10k: r.manualRate10k,
  manualSetAt: r.manualSetAt,
});

/** Cotización vigente (con su estado y antigüedad). No hace red; para renovarla si venció ver `currentRate`. */
export async function getEffectiveRate(db: Db, now = Date.now()): Promise<EffectiveRate> {
  return evaluateRate(storedOf(await ensureRow(db, now)), now);
}

/* --------------------------------------------------------------- consulta al proveedor --------------------------------------------------------------- */

export type ProviderQuote = { rate10k: number; providerUpdatedAt: number | null };

/** Valida la respuesta del proveedor: debe ser el dólar blue, con venta positiva y razonable. Lanza Error con un mensaje claro si no. */
export function parseProviderResponse(body: unknown): ProviderQuote {
  if (!body || typeof body !== "object") throw new Error("La respuesta del proveedor no es un objeto JSON.");
  const b = body as Record<string, unknown>;
  if (typeof b.casa === "string" && b.casa.toLowerCase() !== "blue") throw new Error(`El proveedor devolvió la casa «${b.casa}», no el dólar blue.`);
  if (typeof b.moneda === "string" && b.moneda.toUpperCase() !== "USD") throw new Error(`El proveedor devolvió la moneda «${b.moneda}», no USD.`);
  if (typeof b.casa !== "string") throw new Error("La respuesta no identifica la casa (blue).");
  const rate10k = toRate10k(b.venta);
  if (rate10k === null) throw new Error("El valor de venta del proveedor no es un número positivo razonable.");
  if (typeof b.compra === "number" && Number.isFinite(b.compra) && b.compra > 0 && b.venta !== undefined && (b.venta as number) < b.compra * 0.5) throw new Error("El valor de venta es incoherente con el de compra.");
  let providerUpdatedAt: number | null = null;
  if (typeof b.fechaActualizacion === "string") {
    const t = Date.parse(b.fechaActualizacion);
    if (Number.isFinite(t)) providerUpdatedAt = t;
  }
  return { rate10k, providerUpdatedAt };
}

export type RefreshResult = { ok: true; changed: boolean; rate10k: number; skipped?: false } | { ok: false; error: string; skipped?: false } | { skipped: true; reason: string };

let inFlight: Promise<RefreshResult> | null = null;

/** Tiempo máximo de la consulta cuando la dispara un pedido de un visitante (la tarea programada y el panel usan el normal de 6 s). */
export const INLINE_TIMEOUT_MS = 3000;

type RefreshOpts = { fetchFn?: FetchLike; now?: number; force?: boolean; timeoutMs?: number };

/**
 * Consulta al proveedor y guarda el resultado. En un solo vuelo por instancia y, entre instancias, un solo intento por ventana de 15 minutos:
 * el intento se «reclama» en la base con un UPDATE condicional atómico. Nunca lanza: devuelve el resultado.
 * - Éxito: guarda tasa, fecha de publicación del proveedor y fecha de consulta.
 * - Fallo (red, formato, valor inválido o salto sospechoso): conserva la última tasa válida y registra el error.
 * Corre también en modo manual (para mantener al día la automática), pero no cambia el valor vigente.
 */
export function refreshRate(db: Db, opts: RefreshOpts = {}): Promise<RefreshResult> {
  if (!autoRefreshEnabled() && !opts.fetchFn) return Promise.resolve({ skipped: true, reason: "FX_AUTO_REFRESH=0: las consultas de red están desactivadas." });
  if (inFlight) return inFlight;
  inFlight = runRefresh(db, opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runRefresh(db: Db, opts: RefreshOpts): Promise<RefreshResult> {
  const now = opts.now ?? Date.now();
  await ensureRow(db, now);
  // Reclamo atómico del intento: se marca ANTES de salir a la red, así varias instancias (o pedidos) no consultan a la vez.
  const due = or(isNull(fxSettings.lastAttemptAt), lte(fxSettings.lastAttemptAt, now - REFRESH_INTERVAL_MS));
  const claimed = await db
    .update(fxSettings)
    .set({ lastAttemptAt: now })
    .where(opts.force ? eq(fxSettings.id, 1) : and(eq(fxSettings.id, 1), due))
    .returning({ id: fxSettings.id });
  if (!claimed.length) return { skipped: true, reason: "Se consultó hace menos de 15 minutos." };
  return doRefresh(db, opts.fetchFn ?? (fetch as unknown as FetchLike), now, opts.timeoutMs ?? 6000);
}

async function doRefresh(db: Db, fetchFn: FetchLike, now: number, timeoutMs: number): Promise<RefreshResult> {
  const fail = async (error: string): Promise<RefreshResult> => {
    const prev = await ensureRow(db, now);
    await db.transaction(async (tx) => {
      await tx.update(fxSettings).set({ lastError: error, lastErrorAt: now }).where(eq(fxSettings.id, 1));
      // Se registra solo el primer error de una racha, para no llenar el historial.
      if (!prev.lastError) await tx.insert(fxLog).values({ kind: "auto_error", rate10k: prev.autoRate10k, mode: prev.mode, detail: error.slice(0, 300), userEmail: null, createdAt: now });
    });
    return { ok: false, error };
  };
  let quote: ProviderQuote;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(providerUrl(), { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) return await fail(`El proveedor respondió HTTP ${res.status}.`);
      quote = parseProviderResponse(await res.json());
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    return await fail(e instanceof Error && e.name === "AbortError" ? `El proveedor no respondió a tiempo (${Math.round(timeoutMs / 1000)} s).` : e instanceof Error ? e.message : "Error desconocido al consultar el proveedor.");
  }
  const prev = await ensureRow(db, now);
  if (!isPlausibleJump(prev.autoRate10k, quote.rate10k)) {
    return fail(`El valor recibido (${quote.rate10k / 10000}) difiere más de un 50% del último válido (${(prev.autoRate10k ?? 0) / 10000}): se descartó como sospechoso. Si el cambio es real, fijá el valor manualmente.`);
  }
  const changed = prev.autoRate10k !== quote.rate10k;
  await db.transaction(async (tx) => {
    await tx.update(fxSettings).set({ autoRate10k: quote.rate10k, autoProviderUpdatedAt: quote.providerUpdatedAt, autoFetchedAt: now, lastError: null, lastErrorAt: null, updatedAt: now }).where(eq(fxSettings.id, 1));
    if (changed) await tx.insert(fxLog).values({ kind: "auto_rate", rate10k: quote.rate10k, mode: prev.mode, detail: quote.providerUpdatedAt ? `Publicado por el proveedor: ${new Date(quote.providerUpdatedAt).toISOString()}` : null, userEmail: null, createdAt: now });
  });
  return { ok: true, changed, rate10k: quote.rate10k };
}

/**
 * Cotización vigente para atender un pedido: si la última consulta venció, la renueva ANTES de responder (con un tiempo máximo corto) y luego evalúa.
 * En serverless no se puede dejar trabajo «para después» (la función se congela al responder), por eso se espera. Nunca lanza ni demora más del
 * tiempo máximo: ante cualquier falla de la renovación se usa la cotización guardada.
 */
export async function currentRate(db: Db, now = Date.now()): Promise<EffectiveRate> {
  let row = await ensureRow(db, now);
  if (autoRefreshEnabled() && (row.lastAttemptAt === null || now - row.lastAttemptAt >= REFRESH_INTERVAL_MS)) {
    try {
      const r = await refreshRate(db, { now, timeoutMs: INLINE_TIMEOUT_MS });
      if (!("skipped" in r && r.skipped)) row = await ensureRow(db, now);
    } catch {
      /* se reintenta en el próximo pedido */
    }
  }
  return evaluateRate(storedOf(row), now);
}

/** Fija un valor manual (modo manual). Queda registrado con quién y cuándo. */
export async function setManualRate(db: Db, rate: number, actor: Actor, note: string | null, now = Date.now()): Promise<{ rate10k: number }> {
  const rate10k = toRate10k(rate);
  if (rate10k === null) throw new FxError(400, "invalid_rate", "La cotización debe ser un número positivo razonable (entre 1 y 1.000.000 pesos por dólar).");
  await ensureRow(db, now);
  await db.transaction(async (tx) => {
    await tx.update(fxSettings).set({ mode: "manual", manualRate10k: rate10k, manualSetAt: now, manualSetByEmail: actor.email, manualNote: note?.trim().slice(0, 200) || null, updatedAt: now }).where(eq(fxSettings.id, 1));
    await tx.insert(fxLog).values({ kind: "manual_rate", rate10k, mode: "manual", detail: note?.trim().slice(0, 200) || null, userEmail: actor.email, createdAt: now });
  });
  return { rate10k };
}

/** Vuelve a automático (o pasa a manual con el último valor manual guardado). No borra el valor manual anterior. */
export async function setMode(db: Db, mode: "auto" | "manual", actor: Actor, now = Date.now()): Promise<void> {
  const row = await ensureRow(db, now);
  if (mode === "manual" && row.manualRate10k === null) throw new FxError(400, "no_manual_rate", "Primero cargá un valor manual.");
  if (row.mode === mode) return;
  await db.transaction(async (tx) => {
    await tx.update(fxSettings).set({ mode, updatedAt: now }).where(eq(fxSettings.id, 1));
    await tx.insert(fxLog).values({ kind: "mode", rate10k: mode === "manual" ? row.manualRate10k : row.autoRate10k, mode, detail: mode === "auto" ? "Se volvió al modo automático." : "Se activó el valor manual.", userEmail: actor.email, createdAt: now });
  });
}

export class FxError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type FxLogEntry = typeof fxLog.$inferSelect;
export const listFxLog = (db: Db, limit = 50): Promise<FxLogEntry[]> => db.select().from(fxLog).orderBy(desc(fxLog.createdAt), desc(fxLog.id)).limit(Math.min(limit, 500));
