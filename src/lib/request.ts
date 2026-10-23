/**
 * Pedidos del navegador al servidor con plazo máximo. `fetch` no tiene límite de espera propio: con una red que se cuelga puede quedar pendiente hasta que el
 * navegador lo corte (minutos). Acá el plazo cubre la respuesta COMPLETA (cabeceras y cuerpo) y siempre termina en una respuesta o en un `RequestError`.
 * Nunca reintenta por su cuenta: reintentar una escritura es decisión de la persona (y la idempotencia la resuelve el servidor).
 */
export type RequestFailure = "timeout" | "network";

export class RequestError extends Error {
  constructor(readonly kind: RequestFailure) {
    super(kind);
    this.name = "RequestError";
  }
}

export type JsonResult<T> = { ok: boolean; status: number; data: T | null };

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * POST/GET JSON con plazo. Devuelve `{ ok, status, data }` para cualquier respuesta HTTP (data es null si el cuerpo no es JSON).
 * Lanza `RequestError("timeout")` si se vence el plazo y `RequestError("network")` si no hubo conexión. Si la propia persona/componente cancela con
 * `signal`, se propaga el `AbortError` original (no es un fallo que haya que mostrar).
 */
export async function requestJson<T = unknown>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<JsonResult<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init;
  const ctl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctl.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    const data = (await res.json().catch((e: unknown) => {
      if (ctl.signal.aborted) throw e; // se cortó mientras llegaba el cuerpo: lo resuelve el catch de abajo
      return null;
    })) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    if (timedOut) throw new RequestError("timeout");
    if (signal?.aborted) throw e;
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new RequestError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";

/** Tipo de fallo para mostrar un mensaje claro: red caída, plazo vencido, demasiadas solicitudes (429) o error del servidor (5xx y demás). */
export type FailureKind = "timeout" | "network" | "rate_limited" | "server";

export function failureOf(e: unknown): FailureKind {
  return e instanceof RequestError ? e.kind : "network";
}
export const failureOfStatus = (status: number): FailureKind => (status === 429 ? "rate_limited" : "server");

/** Texto para la persona, sin jerga. `what` completa la frase («verificar tu selección», «preparar tu consulta»…). */
export function failureMessage(kind: FailureKind, what: string): string {
  switch (kind) {
    case "timeout": return `La conexión está lenta y no pudimos ${what} a tiempo.`;
    case "network": return `No hay conexión con la tienda: no pudimos ${what}. Revisá tu internet.`;
    case "rate_limited": return `Hay demasiadas solicitudes seguidas y no pudimos ${what}. Esperá unos segundos.`;
    default: return `Tuvimos un problema de nuestro lado y no pudimos ${what}.`;
  }
}
