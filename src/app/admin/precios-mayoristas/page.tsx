import Link from "next/link";
import { AdminWholesalePrices } from "@/components/admin-wholesale-prices";
import { WholesaleExport } from "@/components/wholesale-export";
import { catalog } from "@/content/catalog";
import { kindLabel, languageLabel } from "@/content/schema";
import { getDb } from "@/db/client";
import { applyOverrides, loadOverrides } from "@/features/catalog/overrides";
import { listTiersForAdmin } from "@/features/mayorista/precios";
import { requireAdmin } from "@/server/admin";

export const dynamic = "force-dynamic";

const path = "/admin/precios-mayoristas";
const states = { publicado: "Publicados", borrador: "Con borradores", sin_precio: "Sin precio" } as const;
const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const input = "mt-1 min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base";

export default async function PreciosMayoristas({ searchParams }: { searchParams: Promise<{ q?: string | string[]; estado?: string | string[] }> }) {
  await requireAdmin(path);
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const state = Object.keys(states).find((key) => key === params.estado) ?? "";
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const db = getDb();
  const [overrides, tiers] = await Promise.all([loadOverrides(db), listTiersForAdmin(db)]);
  const byProduct = Map.groupBy(tiers, (tier) => tier.productId);
  const rows = applyOverrides(catalog.products, overrides).filter((p) => !p.retired).map((p) => {
    const prices = byProduct.get(p.id) ?? [];
    const base = prices.find((tier) => tier.state === "publicado");
    const draft = prices.some((tier) => tier.state === "borrador");
    return { p, prices, base, draft, rank: base ? 0 : draft ? 1 : 2 };
  }).filter(({ p, base, draft }) => {
    const search = normalize(`${p.title} ${p.originalTitle ?? ""} ${p.sku} ${p.id}`);
    return words.every((word) => search.includes(word))
      && (!state || (state === "publicado" && base) || (state === "borrador" && draft) || (state === "sin_precio" && !base && !draft));
  }).sort((a, b) => a.rank - b.rank || a.p.title.localeCompare(b.p.title, "es"));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Mayoristas</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Precios mayoristas</h1>
      <p className="mt-2 max-w-2xl text-sm text-ink/75">Cambiá el precio base en USD directamente en la lista. Para ajustar cantidades o publicar cambios, abrí «Editar tramos y publicar».</p>
      <WholesaleExport includeDrafts />
      <form action={path} role="search" className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56 text-sm font-semibold">Producto o SKU
          <input type="search" name="q" defaultValue={query} maxLength={80} className={input} />
        </label>
        <label className="text-sm font-semibold">Estado del precio
          <select name="estado" defaultValue={state} className={input}>
            <option value="">Todos</option>
            {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <button className="min-h-11 rounded-md bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald">Buscar</button>
        {(query || state) && <Link href={path} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Limpiar</Link>}
      </form>
      <p className="mt-3 text-sm text-ink/70" role="status">{rows.length} {rows.length === 1 ? "producto" : "productos"}</p>
      {rows.length === 0 ? <p className="mt-4 rounded-lg border border-ink/15 bg-white p-4">Ningún producto coincide con la búsqueda.</p> : (
        <ul className="mt-4 space-y-3">
          {rows.map(({ p, prices, base, draft }) => (
            <li key={p.id} className="min-w-0 rounded-lg border border-ink/15 bg-white p-3 sm:p-4" data-testid={`mayorista-precio-${p.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{p.title}</h2>
                  <p className="mt-1 break-words text-xs text-ink/70">{p.sku} · {kindLabel[p.kind]} · {languageLabel[p.language]}{p.active ? "" : " · Ficha oculta"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="rounded-full border border-ink/20 px-3 py-1 text-xs font-semibold">{base ? (draft ? "Publicado · con borradores" : "Publicado") : draft ? "Borrador" : "Sin precio"}</p>
                  <Link href={`/admin/productos?q=${encodeURIComponent(p.id)}`} prefetch={false} className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Precio minorista y stock</Link>
                </div>
              </div>
              <AdminWholesalePrices productId={p.id} title={p.title} initialTiers={prices.map(({ minQty, unitPriceUsdMinor, state }) => ({ minQty, unitPriceUsdMinor, state: state === "publicado" ? "publicado" : "borrador" }))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
