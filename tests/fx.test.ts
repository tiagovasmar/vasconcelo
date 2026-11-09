import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db } from "@/db/client";
import { openTestDb } from "./helpers/pg";
import {
  evaluateRate, formatRate, formatUSD, isPlausibleJump, parseRateInput, parseUsdInput, toRate10k, usdInputText, usdToArsMinor,
  FRESH_MAX_AGE_MS, HOUR, PROVIDER_MAX_AGE_MS, USABLE_MAX_AGE_MS, type FxStoredState,
} from "@/features/fx/convert";
import { FxError, getEffectiveRate, getFxRow, listFxLog, parseProviderResponse, refreshRate, setManualRate, setMode, type FetchLike } from "@/features/fx/service";
import { senaYSaldo } from "@/features/politicas/encargos";

const actor = { id: "u1", email: "dueno@example.com" };
const NOW = Date.UTC(2026, 9, 14, 15, 0, 0);
const rate = (n: number) => toRate10k(n)!;

describe("conversión USD → ARS al múltiplo de $100 más cercano (mitades hacia arriba)", () => {
  // Ejemplos sintéticos del encargo: «1.234» y «1.235» son pesos por dólar (1234 y 1235), no cotizaciones vigentes.
  it("USD 10 × 1234 = $12.340 → $12.300", async () => expect(usdToArsMinor(1000, rate(1234))).toBe(1_230_000));
  it("USD 10 × 1235 = $12.350 → $12.400 (la mitad sube)", async () => expect(usdToArsMinor(1000, rate(1235))).toBe(1_240_000));
  it("justo debajo de la mitad baja", async () => expect(usdToArsMinor(1000, rate(1234.99))).toBe(1_230_000));
  it("con decimales en dólares y en la cotización", async () => {
    expect(usdToArsMinor(1250, rate(1425.5))).toBe(1_780_000); // 12,50 × 1425,5 = 17.818,75 → 17.800
    expect(usdToArsMinor(999, rate(1500))).toBe(1_500_000); // 14.985 → 15.000
  });
  it("es exacta con importes grandes (sin errores de punto flotante)", async () => {
    expect(usdToArsMinor(100_000_000, rate(1_000_000))).toBe(100_000_000_000_000); // USD 1.000.000 × 1.000.000
    expect(usdToArsMinor(1, rate(1550))).toBe(10_000); // USD 0,01 × 1550 = $15,50 → mínimo $100 (nunca $0)
  });
  it("un precio positivo nunca da $0: el mínimo es $100", async () => {
    expect(usdToArsMinor(1, rate(1))).toBe(10_000);
  });
  it("precio o cotización ausentes o inválidos → null (pendiente), nunca 0", async () => {
    expect(usdToArsMinor(0, rate(1234))).toBeNull();
    expect(usdToArsMinor(-5, rate(1234))).toBeNull();
    expect(usdToArsMinor(1000, 0)).toBeNull();
    expect(usdToArsMinor(1000, -1)).toBeNull();
    expect(usdToArsMinor(10.5, rate(1234))).toBeNull();
    expect(usdToArsMinor(1000, Number.NaN)).toBeNull();
  });
  it("el precio unitario es siempre múltiplo de $100", async () => {
    for (const usd of [1, 99, 100, 1234, 4999, 25_000]) for (const r of [900, 1234.56, 1550, 2013.37]) expect(usdToArsMinor(usd, rate(r))! % 10_000).toBe(0);
  });
});

describe("cotizaciones y formatos", () => {
  it("toRate10k acepta números positivos razonables y rechaza el resto", async () => {
    expect(toRate10k(1550)).toBe(15_500_000);
    for (const bad of [0, -1, Number.NaN, Infinity, "1500", null, undefined, 0.5, 5_000_000]) expect(toRate10k(bad)).toBeNull();
  });
  it("interpreta lo que escribe una persona", async () => {
    expect(parseRateInput("1425")).toBe(1425);
    expect(parseRateInput("1.425,50")).toBe(1425.5);
    expect(parseRateInput("1425,5")).toBe(1425.5);
    expect(parseRateInput("$ 1.425")).toBe(1425);
    for (const bad of ["", "abc", "0", "-5", "1,2,3", "1.42.5"]) expect(parseRateInput(bad)).toBeNull();
    expect(parseUsdInput("10")).toBe(1000);
    expect(parseUsdInput("10,5")).toBe(1050);
    expect(parseUsdInput("USD 1.250,75")).toBe(125_075);
    for (const bad of ["", "0", "-1", "10,555", "diez"]) expect(parseUsdInput(bad)).toBeNull();
  });
  it("formato consistente: «USD 10,00» y pesos", async () => {
    expect(formatUSD(1000)).toBe("USD 10,00");
    expect(formatUSD(125_075)).toBe("USD 1.250,75");
    expect(formatRate(15_500_000).replace(/\s/g, " ")).toBe("$ 1.550,00");
    expect(usdInputText(1050)).toBe("10,50");
    expect(usdInputText(null)).toBe("");
  });
  it("salto sospechoso: más de 50% de diferencia con la última válida se descarta", async () => {
    expect(isPlausibleJump(null, rate(1500))).toBe(true);
    expect(isPlausibleJump(rate(1500), rate(1600))).toBe(true);
    expect(isPlausibleJump(rate(1500), rate(2300))).toBe(false);
    expect(isPlausibleJump(rate(1500), rate(900))).toBe(false);
  });
});

describe("qué cotización rige y con qué antigüedad", () => {
  const auto = (over: Partial<FxStoredState> = {}): FxStoredState => ({ mode: "auto", autoRate10k: rate(1500), autoProviderUpdatedAt: NOW - HOUR, autoFetchedAt: NOW - 10 * 60_000, manualRate10k: null, manualSetAt: null, ...over });
  it("reciente → al día, sin aviso", async () => expect(evaluateRate(auto(), NOW)).toMatchObject({ status: "fresh", rate10k: rate(1500), warn: false }));
  it("más vieja que 2 h → se usa con aviso", async () => {
    expect(evaluateRate(auto({ autoFetchedAt: NOW - FRESH_MAX_AGE_MS - 1 }), NOW)).toMatchObject({ status: "stale", rate10k: rate(1500), warn: true });
  });
  it("más vieja que 24 h desde la última consulta exitosa → NO se convierte", async () => {
    expect(evaluateRate(auto({ autoFetchedAt: NOW - USABLE_MAX_AGE_MS - 1 }), NOW)).toMatchObject({ status: "expired", rate10k: null });
  });
  it("el proveedor sigue respondiendo pero su fecha de publicación es muy vieja → sin vigencia (distinta de la fecha de consulta)", async () => {
    expect(evaluateRate(auto({ autoProviderUpdatedAt: NOW - PROVIDER_MAX_AGE_MS - 1 }), NOW)).toMatchObject({ status: "expired", rate10k: null });
    expect(evaluateRate(auto({ autoProviderUpdatedAt: NOW - 3 * 24 * HOUR }), NOW)).toMatchObject({ status: "fresh" }); // un fin de semana largo sí es válido
  });
  it("nunca consultada, sin valor o con valor inválido → ninguna", async () => {
    expect(evaluateRate(auto({ autoRate10k: null, autoFetchedAt: null }), NOW)).toMatchObject({ status: "none", rate10k: null });
    expect(evaluateRate(auto({ autoRate10k: 0 }), NOW)).toMatchObject({ status: "none", rate10k: null });
  });
  it("manual: rige sin vencer, identificada como manual", async () => {
    const s = auto({ mode: "manual", manualRate10k: rate(1700), manualSetAt: NOW - 30 * 24 * HOUR, autoFetchedAt: null, autoRate10k: null });
    expect(evaluateRate(s, NOW)).toMatchObject({ status: "manual", mode: "manual", rate10k: rate(1700), warn: false });
    expect(evaluateRate({ ...s, manualRate10k: null }, NOW)).toMatchObject({ status: "none", rate10k: null });
  });
});

describe("respuesta del proveedor (DolarAPI: dólar blue, campo venta)", () => {
  const ok = { moneda: "USD", casa: "blue", nombre: "Blue", compra: 1500, venta: 1550, fechaActualizacion: "2026-10-13T20:57:00.000Z" };
  it("toma venta y conserva la fecha de publicación del proveedor", async () => {
    expect(parseProviderResponse(ok)).toEqual({ rate10k: rate(1550), providerUpdatedAt: Date.parse("2026-10-13T20:57:00.000Z") });
  });
  it.each([
    [{ ...ok, casa: "oficial" }, /oficial/], [{ ...ok, moneda: "EUR" }, /EUR/], [{ ...ok, venta: 0 }, /positivo/], [{ ...ok, venta: -3 }, /positivo/],
    [{ ...ok, venta: "1550" }, /positivo/], [{ ...ok, venta: null }, /positivo/], [{ ...ok, casa: undefined }, /casa/], [{ ...ok, compra: 5000, venta: 1000 }, /incoherente/], [null, /objeto/], ["x", /objeto/],
  ])("rechaza %j", (body, msg) => {
    expect(() => parseProviderResponse(body)).toThrow(msg);
  });
  it("fecha ilegible → se acepta el valor pero sin fecha de publicación", async () => {
    expect(parseProviderResponse({ ...ok, fechaActualizacion: "ayer" }).providerUpdatedAt).toBeNull();
  });
});

describe("actualización y persistencia (con proveedor simulado, sin red)", () => {
  let db: Db;
  const reply = (body: unknown, status = 200): FetchLike => async () => ({ ok: status < 400, status, json: async () => body });
  const quote = (venta: number, fecha = new Date(NOW - 5 * 60_000).toISOString()) => ({ moneda: "USD", casa: "blue", compra: venta - 20, venta, fechaActualizacion: fecha });
  beforeEach(async () => { db = await openTestDb(); });
  afterEach(async () => { delete process.env.FX_AUTO_REFRESH; });

  it("guarda la venta, la fecha del proveedor y la de la consulta (que son distintas)", async () => {
    const r = await refreshRate(db, { fetchFn: reply(quote(1550)), now: NOW });
    expect(r).toMatchObject({ ok: true, changed: true, rate10k: rate(1550) });
    const row = await getFxRow(db);
    expect(row).toMatchObject({ autoRate10k: rate(1550), autoFetchedAt: NOW, lastError: null });
    expect(row.autoProviderUpdatedAt).toBe(NOW - 5 * 60_000);
    expect(await getEffectiveRate(db, NOW + 60_000)).toMatchObject({ status: "fresh", rate10k: rate(1550), mode: "auto" });
    expect(await listFxLog(db)).toHaveLength(1);
  });

  it("si el proveedor falla se conserva la última cotización válida y se informa el error", async () => {
    await refreshRate(db, { fetchFn: reply(quote(1550)), now: NOW });
    const r = await refreshRate(db, { fetchFn: reply({}, 503), now: NOW + 20 * 60_000 });
    expect(r).toMatchObject({ ok: false });
    const row = await getFxRow(db);
    expect(row.autoRate10k).toBe(rate(1550));
    expect(row.autoFetchedAt).toBe(NOW); // la consulta exitosa sigue siendo la anterior
    expect(row.lastError).toMatch(/503/);
    expect(await getEffectiveRate(db, NOW + 20 * 60_000)).toMatchObject({ status: "fresh", rate10k: rate(1550) });
    expect((await listFxLog(db)).map((l) => l.kind)).toEqual(["auto_error", "auto_rate"]);
  });

  it("un fallo de red o de formato nunca deja 0 ni inventa un valor", async () => {
    const boom: FetchLike = async () => { throw new Error("sin red"); };
    expect(await refreshRate(db, { fetchFn: boom, now: NOW })).toMatchObject({ ok: false, error: "sin red" });
    expect(await getEffectiveRate(db, NOW)).toMatchObject({ status: "none", rate10k: null });
    expect(await refreshRate(db, { fetchFn: reply({ casa: "blue", venta: 0 }), now: NOW + 16 * 60_000 })).toMatchObject({ ok: false });
    expect((await getFxRow(db)).autoRate10k).toBeNull();
  });

  it("pasadas 24 h sin una consulta exitosa, los precios dejan de convertirse", async () => {
    await refreshRate(db, { fetchFn: reply(quote(1550, new Date(NOW).toISOString())), now: NOW });
    expect(await getEffectiveRate(db, NOW + 3 * HOUR)).toMatchObject({ status: "stale", warn: true, rate10k: rate(1550) });
    expect(await getEffectiveRate(db, NOW + 25 * HOUR)).toMatchObject({ status: "expired", rate10k: null });
  });

  it("un valor con salto sospechoso se descarta y se conserva el anterior", async () => {
    await refreshRate(db, { fetchFn: reply(quote(1500)), now: NOW });
    const r = await refreshRate(db, { fetchFn: reply(quote(4000)), now: NOW + 20 * 60_000 });
    expect(r).toMatchObject({ ok: false });
    expect((await getFxRow(db)).autoRate10k).toBe(rate(1500));
    expect((await getFxRow(db)).lastError).toMatch(/sospechoso/);
  });

  it("espacia las consultas: no vuelve a salir a la red antes de 15 minutos, salvo force", async () => {
    let calls = 0;
    const f: FetchLike = async () => { calls++; return { ok: true, status: 200, json: async () => quote(1550) }; };
    await refreshRate(db, { fetchFn: f, now: NOW });
    expect(await refreshRate(db, { fetchFn: f, now: NOW + 60_000 })).toMatchObject({ skipped: true });
    expect(calls).toBe(1);
    await refreshRate(db, { fetchFn: f, now: NOW + 16 * 60_000 });
    expect(calls).toBe(2);
    await refreshRate(db, { fetchFn: f, now: NOW + 16 * 60_000 + 1000, force: true });
    expect(calls).toBe(3);
  });

  it("varias consultas simultáneas comparten un solo viaje al proveedor", async () => {
    let calls = 0;
    const f: FetchLike = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { ok: true, status: 200, json: async () => quote(1550) }; };
    await Promise.all([refreshRate(db, { fetchFn: f, now: NOW }), refreshRate(db, { fetchFn: f, now: NOW, force: true }), refreshRate(db, { fetchFn: f, now: NOW, force: true })]);
    expect(calls).toBe(1);
  });

  it("FX_AUTO_REFRESH=0 desactiva toda consulta de red", async () => {
    process.env.FX_AUTO_REFRESH = "0";
    expect(await refreshRate(db, { now: NOW })).toMatchObject({ skipped: true });
  });

  it("modo manual: explícito, persistente y no lo reemplaza la actualización automática", async () => {
    await refreshRate(db, { fetchFn: reply(quote(1500)), now: NOW });
    await setManualRate(db, 1720.5, actor, "proveedor con error", NOW + 1);
    expect(await getEffectiveRate(db, NOW + 2)).toMatchObject({ status: "manual", mode: "manual", rate10k: rate(1720.5) });
    await refreshRate(db, { fetchFn: reply(quote(1600)), now: NOW + 20 * 60_000 });
    expect((await getFxRow(db)).autoRate10k).toBe(rate(1600)); // la automática sigue al día…
    expect(await getEffectiveRate(db, NOW + 21 * 60_000)).toMatchObject({ status: "manual", rate10k: rate(1720.5) }); // …pero rige la manual
    expect(await getFxRow(db)).toMatchObject({ manualSetByEmail: "dueno@example.com", manualNote: "proveedor con error" });
    await setMode(db, "auto", actor, NOW + 30 * 60_000);
    expect(await getEffectiveRate(db, NOW + 31 * 60_000)).toMatchObject({ status: "fresh", mode: "auto", rate10k: rate(1600) });
    await setMode(db, "manual", actor, NOW + 32 * 60_000);
    expect(await getEffectiveRate(db, NOW + 33 * 60_000)).toMatchObject({ mode: "manual", rate10k: rate(1720.5) }); // el valor manual anterior se conserva
    expect((await listFxLog(db)).map((l) => l.kind)).toEqual(["mode", "mode", "auto_rate", "manual_rate", "auto_rate"]);
  });

  it("rechaza un valor manual inválido y no pasa a manual sin valor cargado", async () => {
    for (const bad of [0, -3, Number.NaN, 5_000_000]) await expect(setManualRate(db, bad, actor, null)).rejects.toThrow(FxError);
    await expect(setMode(db, "manual", actor)).rejects.toThrow(/manual/);
    expect((await getFxRow(db)).mode).toBe("auto");
  });
});

describe("descuento y seña sin redondeos sucesivos", () => {
  it("seña del 20% + saldo = importe cotizado, sin redondear cada parte a $100", async () => {
    const q = 1_230_000 * 3 + 240_000;
    const r = senaYSaldo(q)!;
    expect(r.senaMinor + r.saldoMinor).toBe(q);
    expect(r.senaMinor).toBe(q / 5);
    // Aun con un importe que no es múltiplo de $100 (cotización ya acordada), la suma es exacta.
    const odd = senaYSaldo(1_234_550)!;
    expect(odd.senaMinor + odd.saldoMinor).toBe(1_234_550);
    expect(odd.senaMinor % 10_000).not.toBe(0);
    expect(senaYSaldo(null)).toBeNull();
    expect(senaYSaldo(0)).toBeNull();
  });
});
