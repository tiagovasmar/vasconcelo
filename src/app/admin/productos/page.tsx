import Link from "next/link";
import { AdminProductTable, type AdminRow, type RowState } from "@/components/admin-product-table";
import { catalog } from "@/content/catalog";
import { kindLabel, languageLabel, languages, productKinds } from "@/content/schema";
import { getDb } from "@/db/client";
import { commercialState } from "@/features/catalog/commercial";
import { adminProducts } from "@/features/catalog/overrides";
import { getLowStock, isLowStock } from "@/features/admin/settings";
import { AdminLowStockSettings } from "@/components/admin-low-stock";
import { currentRate } from "@/features/fx/service";
import { hasAsset } from "@/components/slot";
import { requireAdmin } from "@/server/admin";
import { listTiersForAdmin } from "@/features/mayorista/precios";
import { productFilters, matchesProductFilter } from "@/features/admin/product-filters";

export const dynamic = "force-dynamic";

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Las fotos subidas tienen una versión chica para listas: así no se cargan los originales como miniaturas. */
const thumbOf = (src: string) => (src.startsWith("/images/uploads/") ? src.replace(/\.webp$/, "-t.webp") : `/_next/image?url=${encodeURIComponent(src)}&w=96&q=60`);

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin/productos");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const estado = productFilters.find((e) => e.id === sp.estado)?.id ?? "todos";
  const idioma = languages.find((l) => l === sp.idioma) ?? "";
  const formato = productKinds.find((k) => k === sp.formato) ?? "";
  const coleccion = typeof sp.coleccion === "string" ? sp.coleccion.slice(0, 80) : "";

  const db = getDb();
  const [fx, low, wholesaleTiers] = await Promise.all([currentRate(db), getLowStock(db), listTiersForAdmin(db)]);
  const expOf = (ids: string[]) => ids.map((id) => catalog.expansions.find((e) => e.id === id)).filter((e) => e !== undefined);
  const all = (await adminProducts(db, catalog.products, fx)).map((a): AdminRow & { search: string; lang: string; kindId: string; expIds: string[] } => {
    const p = a.product;
    const base = catalog.products.find((x) => x.id === p.id)!;
    const exps = expOf(p.expansionIds);
    const state: RowState = base.retired ? "retired" : !p.active ? (base.draftNote ? "draft" : "hidden") : p.orderOnly ? "order" : commercialState(p);
    return {
      id: p.id, sku: p.sku, title: p.title, expansion: exps.map((e) => e.name).join(", ") || "—", kind: kindLabel[p.kind], language: languageLabel[p.language], lang: p.language, state,
      wholesaleBaseUsd: wholesaleTiers.find((tier) => tier.productId === p.id && tier.state === "publicado")?.unitPriceUsdMinor ?? null,
      lowStock: state !== "retired" && state !== "hidden" && state !== "draft" && isLowStock(p.stockQuantity, Boolean(p.orderOnly), low.threshold), kindId: p.kind, expIds: p.expansionIds,
      usdMinor: p.priceUsdMinor ?? null, arsMinor: p.priceMinor, priceBase: base.priceBase ?? "usd", packSize: p.packSize ?? null, stock: p.stockQuantity, orderOnly: Boolean(p.orderOnly), version: a.version, overridden: a.overridden,
      thumb: p.images[0] && hasAsset(p.images[0].src) ? thumbOf(p.images[0].src) : null, slug: p.slug,
      search: norm(`${p.title} ${p.originalTitle ?? ""} ${p.sku} ${p.id} ${exps.map((e) => `${e.name} ${e.code ?? ""}`).join(" ")}`),
    };
  }).sort((a, b) => Number(b.usdMinor !== null || b.arsMinor !== null || b.wholesaleBaseUsd != null) - Number(a.usdMinor !== null || a.arsMinor !== null || a.wholesaleBaseUsd != null) || a.title.localeCompare(b.title, "es"));
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const matching = all.filter((r) => (!idioma || r.lang === idioma) && (!formato || r.kindId === formato) && (!coleccion || r.expIds.includes(coleccion)) && terms.every((t) => r.search.includes(t)));
  const counts = Object.fromEntries(productFilters.map(({ id }) => [id, matching.filter((r) => matchesProductFilter(r, id)).length]));
  const rows = matching.filter((r) => matchesProductFilter(r, estado));
  const visibleTotal = all.filter((r) => estado !== "todos" || r.state !== "retired").length;
  const href = (e: string) => `/admin/productos?${new URLSearchParams({ ...(q ? { q } : {}), ...(idioma ? { idioma } : {}), ...(formato ? { formato } : {}), ...(coleccion ? { coleccion } : {}), ...(e !== "todos" ? { estado: e } : {}) }).toString()}`;
  const colecciones = catalog.expansions.filter((e) => catalog.products.some((p) => p.expansionIds.includes(e.id) && !p.retired)).sort((a, b) => a.name.localeCompare(b.name));
  const hayFiltros = Boolean(q || idioma || formato || coleccion || estado !== "todos");

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6">
      <p className="eyebrow text-emerald">Productos</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Precios y stock</h1>
      <form action="/admin/productos" role="search" className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="admin-q" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Buscar por nombre, colección o SKU</label>
          <input id="admin-q" name="q" type="search" defaultValue={q} placeholder="Ej.: Storm, 30th, ZH-…, caja…" className="mt-1 block min-h-11 w-full rounded-md border border-ink/40 bg-white px-3 text-base outline-none focus:border-emerald focus:ring-2 focus:ring-emerald/30" />
        </div>
        <div>
          <label htmlFor="admin-idioma" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Idioma</label>
          <select id="admin-idioma" name="idioma" defaultValue={idioma} className="mt-1 block min-h-11 rounded-md border border-ink/40 bg-white px-3 text-base">
            <option value="">Todos</option>
            {languages.map((l) => <option key={l} value={l}>{languageLabel[l]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="admin-formato" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Formato</label>
          <select id="admin-formato" name="formato" defaultValue={formato} className="mt-1 block min-h-11 rounded-md border border-ink/40 bg-white px-3 text-base">
            <option value="">Todos</option>
            {productKinds.map((k) => <option key={k} value={k}>{kindLabel[k]}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="admin-coleccion" className="block text-[.7rem] font-bold uppercase tracking-[.12em] text-ink/70">Colección</label>
          <select id="admin-coleccion" name="coleccion" defaultValue={coleccion} className="mt-1 block min-h-11 max-w-[16rem] rounded-md border border-ink/40 bg-white px-3 text-base">
            <option value="">Todas</option>
            {colecciones.map((e) => <option key={e.id} value={e.id}>{e.name}{e.language === "zh" ? " (chino)" : ""}</option>)}
          </select>
        </div>
        {estado !== "todos" && <input type="hidden" name="estado" value={estado} />}
        <button className="min-h-11 rounded-lg bg-ink px-5 text-sm font-semibold text-paper hover:bg-emerald">Buscar</button>
        {hayFiltros && <Link href="/admin/productos" className="min-h-11 py-3 text-sm underline underline-offset-4">Limpiar</Link>}
      </form>
      <nav aria-label="Filtrar por estado" data-testid="admin-resumen" className="mt-3 flex flex-wrap gap-2">
        {productFilters.filter((e) => e.id !== "pending" || estado === "pending").map((e) => <Link key={e.id} href={href(e.id)} aria-current={e.id === estado ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-sm ${e.id === estado ? "border-emerald bg-emerald text-paper" : "border-ink/30 bg-white hover:border-emerald"}`}>{e.label} · <span data-testid={`cuenta-${e.id}`}>{counts[e.id]}</span></Link>)}
      </nav>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-ink/70">
        <p role="status" data-testid="admin-cantidad">{rows.length === visibleTotal ? `${rows.length} productos` : `${rows.length} de ${visibleTotal} productos`}</p>
        <p data-testid="admin-fx-resumen">
          {fx.rate10k ? <>Cotización: <b>${(fx.rate10k / 10000).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</b> · {fx.mode === "manual" ? "manual" : fx.status === "stale" ? "automática (vieja)" : "automática"}. </> : <>No hay una cotización utilizable. </>}
          <Link href="/admin/cotizacion" className="font-semibold underline underline-offset-4">Ajustar</Link>
          {" · "}<a href="#stock-bajo" className="font-semibold underline underline-offset-4">Aviso de stock bajo</a>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">Ningún producto coincide con la búsqueda.</p>
      ) : (
        <div className="mt-3">
          <AdminProductTable rows={rows.map(({ search, lang, kindId, expIds, ...row }) => { void search; void lang; void kindId; void expIds; return row; })} lowThreshold={low.threshold} rate10k={fx.rate10k} />
        </div>
      )}
      <div id="stock-bajo" className="scroll-mt-4">
        <AdminLowStockSettings threshold={low.threshold} custom={low.custom} updatedAt={low.updatedAt} updatedBy={low.updatedByEmail} lowCount={all.filter((r) => r.lowStock).length} />
      </div>
    </div>
  );
}
