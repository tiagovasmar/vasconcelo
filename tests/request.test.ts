import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { failureMessage, failureOf, failureOfStatus, isAbort, RequestError, requestJson } from "@/lib/request";

/**
 * Pedidos del navegador con plazo máximo: nunca quedan colgados, distinguen plazo vencido de red caída y de cancelación propia, y nunca reintentan solos.
 * Se prueba con un `fetch` simulado (el comportamiento de red real se prueba en tests/e2e/resiliencia.spec.ts).
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** `fetch` que respeta la señal de cancelación, como el real. */
const hangingFetch = () =>
  vi.fn((_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
      if (init?.signal?.aborted) return reject(abortError()); // como el fetch real: una señal ya cancelada rechaza al instante
      init?.signal?.addEventListener("abort", () => reject(abortError()));
    }),
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("devuelve estado y cuerpo de cualquier respuesta HTTP (también 500 y 429) sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ ok: 1 })).mockResolvedValueOnce(json({ error: { code: "x" } }, 500)).mockResolvedValueOnce(json({}, 429)));
    expect(await requestJson("/a")).toEqual({ ok: true, status: 200, data: { ok: 1 } });
    expect(await requestJson("/a")).toMatchObject({ ok: false, status: 500, data: { error: { code: "x" } } });
    expect(await requestJson("/a")).toMatchObject({ ok: false, status: 429 });
  });

  it("un cuerpo que no es JSON (p. ej. una página de error del proveedor) da data null, no una excepción", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));
    expect(await requestJson("/a")).toEqual({ ok: false, status: 502, data: null });
  });

  it("se vence el plazo: lanza RequestError timeout y cancela el pedido pendiente", async () => {
    const f = hangingFetch();
    vi.stubGlobal("fetch", f);
    const caught = requestJson("/a", { timeoutMs: 8000 }).catch((e) => e);
    let settled = false;
    void caught.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(7999);
    expect(f).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const e = await caught;
    expect(e).toBeInstanceOf(RequestError);
    expect(failureOf(e)).toBe("timeout");
    expect((f.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("el plazo cubre también la llegada del cuerpo, no solo las cabeceras", async () => {
    // Cabeceras al instante, cuerpo que nunca termina; al cancelar, el cuerpo se corta con error, como en el fetch real.
    vi.stubGlobal("fetch", vi.fn((_u: unknown, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }));
    const caught = requestJson("/a", { timeoutMs: 1000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(failureOf(await caught)).toBe("timeout");
  });

  it("sin conexión: RequestError network", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const e = await requestJson("/a").catch((x) => x);
    expect(e).toBeInstanceOf(RequestError);
    expect(failureOf(e)).toBe("network");
  });

  it("si el propio componente cancela (cambió la selección), se propaga el AbortError: no es un fallo para mostrar", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ctl = new AbortController();
    const caught = requestJson("/a", { signal: ctl.signal, timeoutMs: 8000 }).catch((e) => e);
    ctl.abort();
    const e = await caught;
    expect(isAbort(e)).toBe(true);
    expect(e).not.toBeInstanceOf(RequestError);
  });

  it("una señal ya cancelada tampoco se toma como un fallo", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const ctl = new AbortController();
    ctl.abort();
    expect(isAbort(await requestJson("/a", { signal: ctl.signal }).catch((e) => e))).toBe(true);
  });

  it("no reintenta por su cuenta: un fallo es exactamente una llamada a fetch", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", f);
    await requestJson("/a", { method: "POST" }).catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("libera el temporizador al terminar (sin cancelaciones tardías)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ok: 1 })));
    await requestJson("/a", { timeoutMs: 1000 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("mensajes de error", () => {
  it("distinguen demora, red caída, límite de solicitudes y error del servidor, sin culpar a la persona", () => {
    expect(failureOfStatus(429)).toBe("rate_limited");
    expect(failureOfStatus(500)).toBe("server");
    expect(failureOfStatus(502)).toBe("server");
    const msgs = (["timeout", "network", "rate_limited", "server"] as const).map((k) => failureMessage(k, "calcular tu selección"));
    expect(new Set(msgs).size).toBe(4);
    expect(msgs[0]).toMatch(/lenta/);
    expect(msgs[1]).toMatch(/conexión/);
    expect(msgs[2]).toMatch(/Esperá/);
    expect(msgs[3]).toMatch(/de nuestro lado/);
    for (const m of msgs) expect(m).toContain("calcular tu selección");
  });
});
