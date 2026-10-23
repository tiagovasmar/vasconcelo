"use client";

/* Miniaturas chicas (las subidas tienen una versión de 400 px): un <img> simple alcanza y evita pasar por el optimizador de imágenes. */
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatUSD, parseUsdInput, usdInputText, usdToArsMinor } from "@/features/fx/convert";
import { formatARS } from "@/lib/format";
import { useUnsavedGuard } from "./use-unsaved-guard";

export type RowState = "pending" | "available" | "soldout" | "order" | "hidden" | "draft" | "retired";
export type AdminRow = {
  id: string;
  sku: string;
  title: string;
  expansion: string;
  kind: string;
  language: string;
  state: RowState;
  usdMinor: number | null;
  arsMinor: number | null;
  stock: number | null;
  orderOnly: boolean;
  version: number;
  overridden: boolean;
  thumb: string | null;
  slug: string;
  /** Pocas unidades según el umbral del aviso (solo se ve en el panel). */
  lowStock?: boolean;
  /** Moneda del precio base: «ars» = precio FIJO en pesos (accesorios: no depende del dólar). Sin dato = dólares. */
  priceBase?: "usd" | "ars";
  /** Unidades por pack (accesorios): el stock se administra en PACKS. */
  packSize?: number | null;
};

export const stateInfo: Record<RowState, { label: string; cls: string; help: string }> = {
  pending: { label: "Pendiente", cls: "bg-gold/30 text-ink ring-gold", help: "Falta precio o stock: se ve como «a confirmar» y no se compra." },
  available: { label: "Disponible", cls: "bg-emerald text-paper ring-emerald", help: "Tiene precio y stock: se puede comprar." },
  soldout: { label: "Sin stock", cls: "bg-vermilion text-white ring-vermilion", help: "Stock 0: no se puede comprar; se puede consultar por encargo." },
  order: { label: "Por encargo", cls: "bg-paper text-ink ring-ink/50", help: "No se vende de stock: se consulta y se cotiza con la tienda." },
  hidden: { label: "Oculto", cls: "bg-ink text-paper ring-ink", help: "No aparece en la tienda." },
  draft: { label: "Borrador", cls: "bg-ink text-paper ring-gold", help: "Ficha creada pero no publicada: falta resolver un dato." },
  retired: { label: "Retirado", cls: "bg-ink/15 text-ink ring-ink/30", help: "Retirado por código: no se edita desde el panel." },
};

const field = "block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30 disabled:bg-paper disabled:text-ink/50";
const cap = "block text-[.65rem] font-bold uppercase tracking-[.12em] text-ink/65 lg:hidden";

type Draft = { usd: string; stock: string; /** Precio fijo en pesos enteros (solo productos con precio base en pesos). */ ars: string };
const initial = (r: AdminRow): Draft => ({ usd: usdInputText(r.usdMinor), stock: r.stock === null ? "" : String(r.stock), ars: r.priceBase === "ars" && r.arsMinor !== null ? String(r.arsMinor / 100) : "" });

function parseStock(raw: string): number | null | undefined {
  const t = raw.trim().replace(/[\s.]/g, "");
  if (t === "") return null;
  return /^\d{1,7}$/.test(t) ? Number(t) : undefined;
}

/** Cantidad con signo para ajustar por porcentaje: «10», «-5», «7,5». */
const parsePct = (raw: string): number | null => (/^[+-]?\d{1,3}([.,]\d{1,2})?$/.test(raw.trim()) ? Number(raw.trim().replace(",", ".")) : null);

export function AdminProductTable({ rows, rate10k, lowThreshold = 0 }: { rows: AdminRow[]; rate10k: number | null; lowThreshold?: number }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bStockMode, setBStockMode] = useState<"set" | "add" | "sub">("set");
  const [bStock, setBStock] = useState("");
  const [bPriceMode, setBPriceMode] = useState<"set" | "pct">("set");
  const [bPrice, setBPrice] = useState("");
  const [bMsg, setBMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const selectable = rows.filter((r) => r.state !== "retired");
  const chosen = selectable.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const draftOf = (r: AdminRow): Draft => drafts[r.id] ?? initial(r);
  const dirtyOf = (r: AdminRow) => {
    const d = drafts[r.id];
    if (!d) return false;
    const i = initial(r);
    return d.usd.trim() !== i.usd.trim() || d.stock.trim() !== i.stock.trim() || d.ars.trim() !== i.ars.trim();
  };
  const dirtyIds = useMemo(() => rows.filter(dirtyOf).map((r) => r.id), [rows, drafts]); // eslint-disable-line react-hooks/exhaustive-deps
  useUnsavedGuard(dirtyIds.length > 0);

  function set(r: AdminRow, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [r.id]: { ...draftOf(r), ...patch } }));
    setMsgs((m) => {
      const { [r.id]: _gone, ...rest } = m;
      void _gone;
      return rest;
    });
  }

  async function saveRow(r: AdminRow): Promise<boolean> {
    const d = draftOf(r);
    const isArs = r.priceBase === "ars";
    const arsPesos = isArs ? (/^\d{1,8}$/.test(d.ars.trim()) && Number(d.ars.trim()) >= 1 ? Number(d.ars.trim()) : undefined) : null;
    const usd = isArs || d.usd.trim() === "" ? null : parseUsdInput(d.usd);
    const stock = parseStock(d.stock);
    if (isArs && arsPesos === undefined) {
      setMsgs((m) => ({ ...m, [r.id]: { ok: false, text: "El precio fijo debe ser un número entero de pesos, por ejemplo 1000." } }));
      return false;
    }
    if (!isArs && (usd === undefined || (d.usd.trim() !== "" && usd === null))) {
      setMsgs((m) => ({ ...m, [r.id]: { ok: false, text: "Precio en dólares no válido: escribí por ejemplo 10 o 10,50 (o dejalo vacío si está pendiente)." } }));
      return false;
    }
    if (stock === undefined) {
      setMsgs((m) => ({ ...m, [r.id]: { ok: false, text: "El stock debe ser un número entero (0 si está agotado) o quedar vacío si está pendiente." } }));
      return false;
    }
    setBusy((b) => ({ ...b, [r.id]: true }));
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(r.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isArs ? { priceArsMinor: (arsPesos as number) * 100, stock, expectedVersion: versions[r.id] ?? r.version } : { priceUsdMinor: usd, stock, expectedVersion: versions[r.id] ?? r.version }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgs((m) => ({ ...m, [r.id]: { ok: false, text: data?.error?.message ?? "No se pudo guardar. Intentá de nuevo." } }));
        return false;
      }
      setVersions((v) => ({ ...v, [r.id]: data.version }));
      setDrafts((all) => {
        const { [r.id]: _done, ...rest } = all;
        void _done;
        return rest;
      });
      setMsgs((m) => ({ ...m, [r.id]: { ok: true, text: data.changed.length ? "Guardado." : "Sin cambios." } }));
      return true;
    } catch {
      setMsgs((m) => ({ ...m, [r.id]: { ok: false, text: "Sin conexión con el servidor. No se guardó nada." } }));
      return false;
    } finally {
      setBusy((b) => ({ ...b, [r.id]: false }));
    }
  }

  /** Aplica el cambio en masa SOLO a los borradores de las filas elegidas: se ve la vista previa y recién se guarda con «Guardar N cambios». */
  function applyBulkStock() {
    const t = bStock.trim().replace(/[\s.]/g, "");
    if (!/^\d{1,7}$/.test(t)) {
      setBMsg({ ok: false, text: "Escribí una cantidad entera (por ejemplo 5)." });
      return;
    }
    const n = Number(t);
    let done = 0;
    let skipped = 0;
    for (const r of chosen) {
      const cur = parseStock(draftOf(r).stock);
      if (r.orderOnly || cur === undefined) {
        skipped++;
        continue;
      }
      const next = bStockMode === "set" ? n : bStockMode === "add" ? (cur ?? 0) + n : Math.max(0, (cur ?? 0) - n);
      set(r, { stock: String(Math.min(next, 1_000_000)) });
      done++;
    }
    setBMsg({ ok: done > 0, text: `Stock aplicado a ${done} ${done === 1 ? "fila" : "filas"}${skipped ? ` (se omitieron ${skipped}: por encargo o con un valor inválido)` : ""}. Revisá y pulsá «Guardar» para confirmar.` });
  }
  function applyBulkPrice() {
    let fixed: number | null = null;
    let pct: number | null = null;
    if (bPriceMode === "set") {
      fixed = bPrice.trim() === "" ? null : parseUsdInput(bPrice);
      if (fixed === null || fixed === undefined || fixed < 1) {
        setBMsg({ ok: false, text: "Escribí un precio en dólares, por ejemplo 10 o 10,50." });
        return;
      }
    } else {
      pct = parsePct(bPrice);
      if (pct === null || pct < -90 || pct > 500) {
        setBMsg({ ok: false, text: "Escribí un porcentaje entre -90 y 500, por ejemplo 10 o -5,5." });
        return;
      }
    }
    let done = 0;
    let skipped = 0;
    for (const r of chosen) {
      if (r.priceBase === "ars") { skipped++; continue; } // los accesorios tienen precio fijo en pesos: no se ajustan con dólares ni porcentajes
      let next: number | null;
      if (fixed !== null) next = fixed;
      else {
        const cur = parseUsdInput(draftOf(r).usd);
        next = cur && cur > 0 ? Math.max(1, Math.round(cur * (1 + (pct as number) / 100))) : null; // sin precio cargado no hay base para el porcentaje
      }
      if (next === null || !Number.isSafeInteger(next)) {
        skipped++;
        continue;
      }
      set(r, { usd: usdInputText(next) });
      done++;
    }
    setBMsg({ ok: done > 0, text: `Precio aplicado a ${done} ${done === 1 ? "fila" : "filas"}${skipped ? ` (se omitieron ${skipped} sin precio cargado)` : ""}. Revisá y pulsá «Guardar» para confirmar.` });
  }

  async function saveAll() {
    for (const r of rows.filter(dirtyOf)) await saveRow(r);
    router.refresh();
  }

  return (
    <div>
      <div className="sticky top-0 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-paper/95 px-1 py-2 backdrop-blur" data-testid="admin-barra">
        <button type="button" onClick={saveAll} disabled={dirtyIds.length === 0} className="min-h-11 rounded-lg bg-emerald px-5 text-sm font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-50" data-testid="guardar-todo">
          Guardar {dirtyIds.length > 0 ? `${dirtyIds.length} cambio${dirtyIds.length === 1 ? "" : "s"}` : "cambios"}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-ink/70">{dirtyIds.length > 0 ? `Tenés ${dirtyIds.length} fila${dirtyIds.length === 1 ? "" : "s"} con cambios sin guardar.` : "Todo guardado."}</p>
      </div>

      <div className="mb-3 rounded-lg border border-ink/15 bg-white p-3" data-testid="edicion-multiple">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={selectable.length > 0 && chosen.length === selectable.length} onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((r) => r.id)) : new Set())} className="h-5 w-5 accent-emerald" data-testid="seleccionar-todo" /> Seleccionar los {selectable.length} productos de esta lista
          </label>
          <p className="text-sm text-ink/70" role="status" aria-live="polite" data-testid="seleccionadas">{chosen.length === 0 ? "Elegí filas para cambiar stock o precio de varias a la vez." : `${chosen.length} seleccionada${chosen.length === 1 ? "" : "s"}.`}</p>
          {chosen.length > 0 && <button type="button" className="min-h-11 text-sm underline underline-offset-4" onClick={() => { setSelected(new Set()); setBMsg(null); }}>Quitar selección</button>}
        </div>
        {chosen.length > 0 && (
          <div className="mt-3 grid gap-4 border-t border-ink/10 pt-3 md:grid-cols-2">
            <fieldset className="flex flex-wrap items-end gap-2">
              <legend className="mb-1 text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Stock</legend>
              <select aria-label="Qué hacer con el stock" value={bStockMode} onChange={(e) => setBStockMode(e.target.value as typeof bStockMode)} className="min-h-11 rounded-md border border-ink/40 bg-white px-2 text-sm" data-testid="masivo-stock-modo">
                <option value="set">Poner en</option>
                <option value="add">Sumar</option>
                <option value="sub">Restar</option>
              </select>
              <input aria-label="Cantidad de stock" inputMode="numeric" autoComplete="off" value={bStock} onChange={(e) => setBStock(e.target.value)} placeholder="unidades" className="min-h-11 w-28 rounded-md border border-ink/40 bg-white px-3 text-base" data-testid="masivo-stock-valor" />
              <button type="button" onClick={applyBulkStock} className="min-h-11 rounded-lg border border-ink bg-white px-3 text-sm font-semibold hover:bg-gold" data-testid="masivo-stock-aplicar">Aplicar a {chosen.length}</button>
            </fieldset>
            <fieldset className="flex flex-wrap items-end gap-2">
              <legend className="mb-1 text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Precio base (USD)</legend>
              <select aria-label="Qué hacer con el precio" value={bPriceMode} onChange={(e) => { setBPriceMode(e.target.value as typeof bPriceMode); setBPrice(""); }} className="min-h-11 rounded-md border border-ink/40 bg-white px-2 text-sm" data-testid="masivo-precio-modo">
                <option value="set">Fijar en USD</option>
                <option value="pct">Ajustar en %</option>
              </select>
              <input aria-label={bPriceMode === "set" ? "Precio en dólares" : "Porcentaje de ajuste"} inputMode="decimal" autoComplete="off" value={bPrice} onChange={(e) => setBPrice(e.target.value)} placeholder={bPriceMode === "set" ? "ej. 10,50" : "ej. 10 o -5"} className="min-h-11 w-28 rounded-md border border-ink/40 bg-white px-3 text-base" data-testid="masivo-precio-valor" />
              <button type="button" onClick={applyBulkPrice} className="min-h-11 rounded-lg border border-ink bg-white px-3 text-sm font-semibold hover:bg-gold" data-testid="masivo-precio-aplicar">Aplicar a {chosen.length}</button>
            </fieldset>
          </div>
        )}
        {bMsg && <p role="status" aria-live="polite" className={`mt-2 text-sm font-medium ${bMsg.ok ? "text-emerald" : "text-vermilion"}`} data-testid="masivo-mensaje">{bMsg.text}</p>}
      </div>

      <div className="hidden grid-cols-[96px_minmax(0,2.4fr)_100px_minmax(0,1.1fr)_110px_100px_110px_88px] items-end gap-3 px-3 pb-1 text-[.65rem] font-bold uppercase tracking-[.12em] text-ink/65 lg:grid" aria-hidden="true">
        <span /><span>Producto</span><span>Idioma</span><span>Precio base (USD) / fijo (ARS)</span><span>En pesos</span><span>Stock (packs en accesorios)</span><span>Estado</span><span />
      </div>
      <ul className="space-y-2" data-testid="admin-lista">
        {rows.map((r) => {
          const d = draftOf(r);
          const dirty = dirtyOf(r);
          const parsedUsd = d.usd.trim() === "" ? null : parseUsdInput(d.usd);
          const live = parsedUsd !== null && rate10k ? usdToArsMinor(parsedUsd, rate10k) : null;
          const info = stateInfo[r.state];
          const locked = r.state === "retired";
          const msg = msgs[r.id];
          return (
            <li key={r.id} className={`rounded-xl border bg-white p-3 ${dirty ? "border-gold ring-2 ring-gold/50" : "border-ink/15"}`} data-testid={`admin-fila-${r.id}`} data-state={r.state} data-dirty={dirty}>
              <form onSubmit={(e) => { e.preventDefault(); void saveRow(r).then(() => router.refresh()); }} noValidate className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 lg:grid-cols-[96px_minmax(0,2.4fr)_100px_minmax(0,1.1fr)_110px_100px_110px_88px] lg:items-center">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(r.id)} disabled={locked} onChange={() => toggle(r.id)} aria-label={`Seleccionar ${r.title}`} className="h-6 w-6 shrink-0 accent-emerald" data-testid="seleccionar" />
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-paper-2" aria-hidden="true">
                    {r.thumb ? <img src={r.thumb} alt="" className="h-full w-full object-contain" loading="lazy" /> : <span className="text-[.6rem] text-ink/75">sin foto</span>}
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{r.title}</p>
                  <p className="mt-0.5 text-xs text-ink/65">{r.expansion} · <span className="font-mono">{r.sku}</span> · {r.kind}</p>
                  <p className="mt-1 text-xs lg:hidden">{r.language}</p>
                </div>
                <p className="col-span-2 hidden text-xs lg:col-span-1 lg:block">{r.language}</p>

                {r.priceBase === "ars" ? (
                  <div className="col-span-2 lg:col-span-1">
                    <label htmlFor={`ars-${r.id}`} className={cap}>Precio fijo (ARS)</label>
                    <input id={`ars-${r.id}`} aria-label={`Precio fijo en pesos (ARS): ${r.title}`} name="ars" inputMode="numeric" autoComplete="off" value={d.ars} disabled={locked} onChange={(e) => set(r, { ars: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="en pesos" className={field} data-testid="input-ars" />
                    <span className="mt-1 block text-[.7rem] text-ink/65">Pesos fijos: no cambia con el dólar.</span>
                  </div>
                ) : (
                <div className="col-span-2 lg:col-span-1">
                  <label htmlFor={`usd-${r.id}`} className={cap}>Precio base (USD)</label>
                  <input id={`usd-${r.id}`} aria-label={`Precio base en USD: ${r.title}`} name="usd" inputMode="decimal" autoComplete="off" value={d.usd} disabled={locked} onChange={(e) => set(r, { usd: e.target.value })} placeholder="pendiente" className={field} data-testid="input-usd" />
                </div>
                )}
                <div className="col-span-2 lg:col-span-1">
                  <span className={cap}>En pesos (convertido)</span>
                  <p className="min-h-11 text-sm font-semibold leading-[2.75rem]" data-testid="ars" aria-live="polite">
                    {dirty && parsedUsd !== null ? (live !== null ? <span className="text-ink/80">→ {formatARS(live)}</span> : "sin cotización") : r.arsMinor !== null ? formatARS(r.arsMinor) : r.usdMinor !== null ? <span className="text-ink/60">sin cotización</span> : <span className="text-ink/60">pendiente</span>}
                  </p>
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <label htmlFor={`stock-${r.id}`} className={cap}>{r.packSize ? "Packs disponibles" : "Stock"}</label>
                  <input id={`stock-${r.id}`} aria-label={`${r.packSize ? "Packs disponibles" : "Stock"}: ${r.title}`} name="stock" inputMode="numeric" autoComplete="off" value={r.orderOnly ? "" : d.stock} disabled={locked || r.orderOnly} onChange={(e) => set(r, { stock: e.target.value })} placeholder={r.orderOnly ? "por encargo" : "pendiente"} className={field} data-testid="input-stock" />
                  {r.lowStock && lowThreshold > 0 && !dirty && <span className="mt-1 inline-block rounded-full bg-gold/40 px-2 py-0.5 text-[.7rem] font-semibold text-ink ring-1 ring-gold" data-testid="stock-bajo">Stock bajo</span>}
                </div>
                <div className="col-span-2 lg:col-span-1">
                  <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ring-1 ${info.cls}`} data-testid="estado" title={info.help}>{info.label}</span>
                </div>
                <div className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1 lg:flex-col lg:items-stretch">
                  <button type="submit" disabled={!dirty || busy[r.id] || locked} className="min-h-11 rounded-lg bg-emerald px-3 text-sm font-semibold text-paper hover:bg-emerald-2 disabled:cursor-not-allowed disabled:opacity-40" data-testid="guardar-fila">{busy[r.id] ? "…" : "Guardar"}</button>
                  <Link href={`/admin/productos/${encodeURIComponent(r.id)}`} className="text-center text-sm font-medium underline underline-offset-4" data-testid="editar-ficha">Editar ficha</Link>
                </div>
              </form>
              {(msg || (r.usdMinor !== null && r.arsMinor === null)) && (
                <p role="status" aria-live="polite" className={`mt-2 text-xs font-medium ${msg ? (msg.ok ? "text-emerald" : "text-vermilion") : "text-ink/65"}`} data-testid="mensaje">
                  {msg?.text ?? `Precio base ${formatUSD(r.usdMinor!)}: sin cotización utilizable no se muestra el valor en pesos.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
