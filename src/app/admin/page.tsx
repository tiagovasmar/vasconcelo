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

export const dynamic = "force-dynamic";

const ESTADOS = [
  { id: "todos", label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "available", label: "Disponibles" },
  { id: "soldout", label: "Sin stock" },
  { id: "low", label: "Stock bajo" },
  { id: "order", label: "Por encargo" },
  { id: "hidden", label: "Ocultos y borradores" },
  { id: "retired", label: "Retirados" },
] as const;

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Las fotos subidas tienen una versión chica para listas: así no se cargan los originales como miniaturas. */
const thumbOf = (src: string) => (src.startsWith("/images/uploads/") ? src.replace(/\.webp$/, "-t.webp") : `/_next/image?url=${encodeURIComponent(src)}&w=96&q=60`);

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin("/admin");
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 80);
  const estado = ESTADOS.find((e) => e.id === sp.estado)?.id ?? "todos";
  const idioma = languages.find((l) => l === sp.idioma) ?? "";
  const formato = productKinds.find((k) => k === sp.formato) ?? "";
  const coleccion = typeof sp.coleccion === "string" ? sp.coleccion.slice(0, 80) : "";

  const db = getDb();
  const [fx, low] = await Promise.all([currentRate(db), getLowStock(db)]);
  const expOf = (ids: string[]) => ids.map((id) => catalog.expansions.find((e) => e.id === id)).filter((e) => e !== undefined);
  const all = (await adminProducts(db, catalog.products, fx)).map((a): AdminRow & { search: string; lang: string; kindId: string; expIds: string[] } => {
    const p = a.product;
    const base = catalog.products.find((x) => x.id === p.id)!;
    const exps = expOf(p.expansionIds);
    const state: RowState = base.retired ? "retired" : !p.active ? (base.draftNote ? "draft" : "hidden") : p.orderOnly ? "order" : commercialState(p);
    return {
      id: p.id, sku: p.sku, title: p.title, expansion: exps.map((e) => e.name).join(", ") || "—", kind: kindLabel[p.kind], language: languageLabel[p.language], lang: p.language, state,
      lowStock: state !== "retired" && state !== "hidden" && state !== "draft" && isLowStock(p.stockQuantity, Boolean(p.orderOnly), low.threshold), kindId: p.kind, expIds: p.expansionIds,
      usdMinor: p.priceUsdMinor ?? null, arsMinor: p.priceMinor, priceBase: base.priceBase ?? "usd", packSize: p.packSize ?? null, stock: p.stockQuantity, orderOnly: Boolean(p.orderOnly), version: a.version, overridden: a.overridden,
      thumb: p.images[0] && hasAsset(p.images[0].src) ? thumbOf(p.images[0].src) : null, slug: p.slug,
      search: norm(`${p.title} ${p.originalTitle ?? ""} ${p.sku} ${p.id} ${exps.map((e) => `${e.name} ${e.code ?? ""}`).join(" ")}`),
    };
  });
  const counts: Record<string, number> = { pending: 0, available: 0, soldout: 0, low: 0, order: 0, hidden: 0, retired: 0 };
  for (const r of all) { counts[r.state === "draft" ? "hidden" : r.state]++; if (r.lowStock) counts.low++; }
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const rows = all.filter((r) => {
    const st = r.state === "draft" ? "hidden" : r.state;
    // «Todos» no incluye los retirados por código (no se editan): se ven con su propio filtro.
    return (estado === "todos" ? r.state !== "retired" : estado === "low" ? r.lowStock : st === estado) && (!idioma || r.lang === idioma) && (!formato || r.kindId === formato) && (!coleccion || r.expIds.includes(coleccion)) && terms.every((t) => r.search.includes(t));
  });
  const visibleTotal = all.filter((r) => estado !== "todos" || r.state !== "retired").length;
  const href = (e: string) => `/admin?${new URLSearchParams({ ...(q ? { q } : {}), ...(idioma ? { idioma } : {}), ...(formato ? { formato } : {}), ...(coleccion ? { coleccion } : {}), ...(e !== "todos" ? { estado: e } : {}) }).toString()}`;
  const colecciones = catalog.expansions.filter((e) => catalog.products.some((p) => p.expansionIds.includes(e.id) && !p.retired)).sort((a, b) => a.name.localeCompare(b.name));
  const hayFiltros = Boolean(q || idioma || formato || coleccion || estado !== "todos");
  const priced = all.filter((r) => r.usdMinor !== null).length;
  const usdProducts = all.filter((r) => r.state !== "retired" && r.priceBase !== "ars").length; // los accesorios tienen precio fijo en pesos: no cuentan acá

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-10">
      <p className="eyebrow text-emerald">Panel del dueño</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Precios y stock</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink/75">
        Cargá el precio base en <b>dólares</b>: la tienda lo muestra en pesos con el dólar blue (venta), redondeado a múltiplos de $100.
        Los cambios se guardan en la base de datos y se ven enseguida en la tienda. Abrir WhatsApp no descuenta stock: el stock lo manejás vos desde acá.
      </p>
      <p className={`mt-3 inline-block rounded-lg border px-3 py-2 text-sm ${fx.rate10k ? "border-ink/15 bg-white" : "border-vermilion/50 bg-vermilion/5"}`} data-testid="admin-fx-resumen">
        {fx.rate10k ? <>Cotización vigente: <b>${(fx.rate10k / 10000).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</b> · {fx.mode === "manual" ? "valor manual" : fx.status === "stale" ? "automática (vieja)" : "automática"}. </> : <b>No hay una cotización utilizable: los precios en pesos quedan pendientes. </b>}
        <Link href="/admin/cotizacion" className="font-semibold underline underline-offset-4">Ver y ajustar la cotización</Link>
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7" data-testid="admin-resumen">
        {([["pending", "Pendientes"], ["available", "Disponibles"], ["soldout", "Sin stock"], ["low", "Stock bajo"], ["order", "Por encargo"], ["hidden", "Ocultos / borrador"], ["retired", "Retirados"]] as const).map(([k, l]) => (
          <div key={k} className="rounded-lg border border-ink/15 bg-white px-4 py-3"><dt className="text-xs text-ink/70">{l}</dt><dd className="text-2xl font-semibold" data-testid={`cuenta-${k}`}>{counts[k]}</dd></div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-ink/65">{priced} de {usdProducts} productos con precio en USD tienen el precio cargado. Los accesorios tienen precio fijo en pesos (no usan el dólar) y su stock se cuenta en packs.</p>

      <AdminLowStockSettings threshold={low.threshold} custom={low.custom} updatedAt={low.updatedAt} updatedBy={low.updatedByEmail} lowCount={counts.low} />

      <form action="/admin" role="search" className="mt-6 flex flex-wrap items-end gap-3">
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
        {hayFiltros && <Link href="/admin" className="min-h-11 py-3 text-sm underline underline-offset-4">Limpiar</Link>}
      </form>
      <nav aria-label="Filtrar por estado" className="mt-4 flex flex-wrap gap-2">
        {ESTADOS.map((e) => <Link key={e.id} href={href(e.id)} aria-current={e.id === estado ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm ${e.id === estado ? "border-emerald bg-emerald text-paper" : "border-ink/30 bg-white hover:border-emerald"}`}>{e.label}{e.id !== "todos" && ` (${counts[e.id]})`}</Link>)}
      </nav>

      <p role="status" className="mt-5 text-sm text-ink/70" data-testid="admin-cantidad">{rows.length === visibleTotal ? `${rows.length} productos` : `${rows.length} de ${visibleTotal} productos`}</p>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink/40 bg-white/60 p-8 text-center text-ink/70">Ningún producto coincide con la búsqueda.</p>
      ) : (
        <div className="mt-3">
          <AdminProductTable rows={rows.map(({ search, lang, kindId, expIds, ...row }) => { void search; void lang; void kindId; void expIds; return row; })} lowThreshold={low.threshold} rate10k={fx.rate10k} />
        </div>
      )}
    </div>
  );
}
