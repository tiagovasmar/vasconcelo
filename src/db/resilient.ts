import postgres, { type Options, type Sql } from "postgres";

/**
 * Tiempos máximos y recuperación para la conexión a PostgreSQL (sin cambiar el modo de conexión: sesión 5432, `prepare: false`).
 *
 * Causa de las solicitudes colgadas con la base caída (reproducida con bases descartables): `postgres.js` cuenta los fallos de conexión de forma COMPARTIDA y
 * espera `3^fallos / 100` segundos (hasta 20 s) antes de cada nuevo intento; con una sola conexión, cada solicitud que llega espera ese retardo
 * y, si falla, lo alarga: unas pocas solicitudes seguidas suman minutos. Además, un servidor que acepta la conexión pero deja de contestar
 * dejaba la consulta pendiente sin límite.
 *
 * Qué hace esto:
 *  - `backoffSeconds`: espera acotada (≤ 1 s, con variación) entre intentos de conexión.
 *  - Plazo por consulta (espera en cola + ejecución): al vencer se CANCELA en el servidor (`cancel()`); si el servidor no responde la cancelación en
 *    `graceMs`, se descarta toda la conexión (`end({ timeout: 0 })`) y se crea una nueva para la próxima solicitud: no quedan conexiones bloqueadas ni
 *    consultas ejecutándose en segundo plano, y la aplicación se recupera sola cuando vuelve la base. Quien esperaba recibe un error controlado.
 *  - Nada se reintenta: ni lecturas ni escrituras. Una transacción cuya sentencia vence se revierte (el servidor la deshace al cerrarse la conexión).
 */
export class DbTimeoutError extends Error {
  readonly code = "DB_TIMEOUT";
  constructor(ms: number) {
    super(`La base de datos no respondió en ${Math.round(ms / 1000)} s`);
    this.name = "DbTimeoutError";
  }
}

/** Espera entre intentos de conexión: crece de 0,1 s a 1 s como máximo (el valor por defecto de la biblioteca llega a 20 s). */
export const backoffSeconds = (retries: number) => (0.5 + Math.random() / 2) * Math.min(0.1 * 2 ** retries, 1);

type Pending = PromiseLike<unknown> & { cancel?: () => unknown };

export function resilientPostgres(url: string, options: Options<Record<string, never>>, limits: { queryTimeoutMs: number; graceMs?: number }): Sql {
  const make = () => postgres(url, { ...options, backoff: backoffSeconds }) as unknown as Sql;
  let current = make();
  const grace = limits.graceMs ?? 3000;

  /** Descarta la conexión que no responde y deja lista una nueva (la solicitud siguiente la usa). */
  const replace = (stuck: Sql) => {
    if (current !== stuck) return;
    current = make();
    void Promise.resolve(stuck.end({ timeout: 0 })).catch(() => undefined);
  };

  /** Envuelve una consulta pendiente: plazo → cancelar → si no responde, descartar la conexión y fallar sin esperar más. */
  const guard = (q: Pending, owner: Sql): unknown => {
    if (limits.queryTimeoutMs <= 0) return q;
    const proxy: unknown = new Proxy(q, {
      get(target, prop) {
        if (prop === "then") {
          return (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
            new Promise((resolve, reject) => {
              let done = false;
              let graceTimer: ReturnType<typeof setTimeout> | undefined;
              const finish = (fn: (v: unknown) => void, v: unknown) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                clearTimeout(graceTimer);
                fn(v);
              };
              const timer = setTimeout(() => {
                try {
                  void Promise.resolve(target.cancel?.()).catch(() => undefined);
                } catch {
                  /* el pedido ya terminó */
                }
                graceTimer = setTimeout(() => {
                  replace(owner);
                  finish(reject, new DbTimeoutError(limits.queryTimeoutMs + grace));
                }, grace);
              }, limits.queryTimeoutMs);
              target.then((v) => finish(resolve, v), (e) => finish(reject, e));
            }).then(onOk, onErr);
        }
        if (prop === "catch") return (onErr?: (e: unknown) => unknown) => (proxy as Promise<unknown>).then(undefined, onErr);
        if (prop === "finally") return (fn?: () => void) => (proxy as Promise<unknown>).then((v) => (fn?.(), v), (e) => { fn?.(); throw e; });
        const v = Reflect.get(target, prop, target);
        // Los modificadores (`values()`, `raw()`…) devuelven la misma consulta pendiente: se sigue devolviendo la versión vigilada.
        return typeof v === "function" ? (...args: unknown[]) => { const r = (v as (...a: unknown[]) => unknown).apply(target, args); return r === target ? proxy : r; } : v;
      },
    });
    return proxy;
  };

  /** Vista de una conexión (`Sql` o la de una transacción) con consultas vigiladas. */
  const view = (get: () => Sql): Sql =>
    new Proxy((() => undefined) as unknown as Sql, {
      apply: (_t, _this, args) => {
        const s = get();
        return guard((s as unknown as (...a: unknown[]) => Pending)(...args), s);
      },
      get: (_t, prop) => {
        const s = get();
        if (prop === "unsafe") return (...args: unknown[]) => guard((s.unsafe as unknown as (...a: unknown[]) => Pending)(...args), s);
        if (prop === "begin") {
          return (...args: unknown[]) => {
            const cb = args[args.length - 1] as (tx: Sql) => unknown;
            const wrapped = [...args.slice(0, -1), (tx: Sql) => cb(view(() => tx))];
            return guard((s.begin as unknown as (...a: unknown[]) => Pending)(...wrapped), s);
          };
        }
        const v = Reflect.get(s, prop, s);
        return typeof v === "function" ? v.bind(s) : v;
      },
    });
  return view(() => current);
}
