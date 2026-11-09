"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseUsdInput, usdInputText, formatUSD } from "@/features/fx/convert";
import { useUnsavedGuard } from "./use-unsaved-guard";

type Tier = { minQty: number; unitPriceUsdMinor: number; state: "borrador" | "publicado" };
const field = "min-h-11 min-w-0 w-full rounded-md border border-ink/40 bg-white px-3 text-base";

export function AdminWholesalePrices({ productId, title, baseUsd }: { productId: string; title: string; baseUsd?: number | null }) {
  const router = useRouter();
  const loaded = useRef(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [minQty, setMinQty] = useState("1");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useUnsavedGuard(Object.keys(edits).length > 0 || price.trim() !== "");

  async function load() {
    const response = await fetch(`/api/admin/mayorista?productId=${encodeURIComponent(productId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "No pudimos cargar los tramos.");
    setTiers(data.tiers); setEdits({}); loaded.current = true;
  }
  async function open() {
    if (loaded.current || busy) return;
    setBusy(true);
    try { await load(); } catch (error) { setMessage(error instanceof Error ? error.message : "No hay conexión."); }
    finally { setBusy(false); }
  }
  async function action(body: { action: string; minQty?: number; unitPriceUsdMinor?: number }, ok: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/mayorista", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, productId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "No pudimos guardar.");
      const remaining = Object.fromEntries(Object.entries(edits).filter(([qty]) => Number(qty) !== body.minQty));
      await load(); setEdits(remaining); setMessage(ok); setPrice(""); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No hay conexión: reintentá."); }
    finally { setBusy(false); }
  }
  function save(quantity: number, raw: string) {
    const unitPriceUsdMinor = parseUsdInput(raw);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || !unitPriceUsdMinor || unitPriceUsdMinor <= 0) { setMessage("Ingresá una cantidad entera y un precio USD mayor que cero."); return; }
    void action({ action: "tier", minQty: quantity, unitPriceUsdMinor }, "Tramo guardado como borrador. Publicalo cuando revises todos los precios.");
  }

  return <details className="mt-3 min-w-0 rounded-lg border border-ink/20 bg-paper/60 p-3" onToggle={(event) => { if (event.currentTarget.open) void open(); }} data-testid="mayorista-en-producto">
    <summary className="min-h-8 cursor-pointer font-semibold text-sm">Precios mayoristas{baseUsd ? ` · base ${formatUSD(baseUsd)}` : " · configurar"}</summary>
    <div className="mt-3 min-w-0" aria-label={`Precios mayoristas de ${title}`}>
      <p className="text-xs text-ink/75">Precio unitario en USD por cantidad. El primer tramo es el precio base. Guardar no cambia stock ni precio minorista; publicá los tramos para mostrarlos en mayoristas.</p>
      {tiers.map((tier) => <div key={tier.minQty} className="mt-3 grid min-w-0 gap-2 rounded-md border border-ink/15 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
        <p className="text-sm">Desde <b>{tier.minQty}</b> unidades <span className="block text-xs">{tier.state === "publicado" ? "Publicado" : "Borrador"}</span></p>
        <label className="text-xs">Precio USD desde {tier.minQty}<input aria-label={`Precio mayorista desde ${tier.minQty}: ${title}`} inputMode="decimal" className={field} value={edits[tier.minQty] ?? usdInputText(tier.unitPriceUsdMinor)} onChange={(event) => setEdits((current) => ({ ...current, [tier.minQty]: event.target.value }))} disabled={busy} /></label>
        <button type="button" disabled={busy || edits[tier.minQty] === undefined} onClick={() => save(tier.minQty, edits[tier.minQty])} className="min-h-11 rounded-md border border-ink/30 px-3 text-sm font-semibold disabled:opacity-50">Guardar tramo</button>
        <button type="button" disabled={busy} onClick={() => { if (window.confirm(`¿Quitar el tramo desde ${tier.minQty} de ${title}?`)) void action({ action: "delete_tier", minQty: tier.minQty }, "Tramo quitado."); }} className="min-h-11 px-3 text-sm text-vermilion underline disabled:opacity-50">Quitar</button>
      </div>)}
      <fieldset disabled={busy} className="mt-3 grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <legend className="mb-2 text-sm font-semibold">Agregar tramo</legend>
        <label className="text-xs">Desde (unidades)<input aria-label={`Desde unidades mayoristas: ${title}`} className={field} inputMode="numeric" value={minQty} onChange={(event) => setMinQty(event.target.value.replace(/\D/g, ""))} /></label>
        <label className="text-xs">Precio unitario USD<input aria-label={`Nuevo precio mayorista: ${title}`} className={field} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} /></label>
        <button type="button" onClick={() => save(Number(minQty), price)} className="min-h-11 rounded-md bg-emerald px-3 text-sm font-semibold text-white">Guardar borrador</button>
      </fieldset>
      <p className="mt-2 text-xs text-ink/70">Cajas: escalas cada 3; sobres: cada 10. El mínimo del pedido se define en las condiciones mayoristas.</p>
      {tiers.length > 0 && <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy || Object.keys(edits).length > 0} onClick={() => void action({ action: tiers.some((tier) => tier.state === "borrador") ? "publish" : "unpublish" }, tiers.some((tier) => tier.state === "borrador") ? "Precios publicados en el catálogo mayorista." : "Precios pasados a borrador.")} className="min-h-11 rounded-md border border-emerald px-3 text-sm font-bold disabled:opacity-50">{tiers.some((tier) => tier.state === "borrador") ? "Publicar precios mayoristas" : "Pasar precios a borrador"}</button></div>}
      <p role="status" className="mt-2 text-sm">{busy ? "Procesando…" : message}</p>
    </div>
  </details>;
}
