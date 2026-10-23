import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterShell } from "@/components/filter-shell";
import { ProductCard } from "@/components/product-card";
import { FxNote } from "@/components/fx-note";
import { ArrowIcon } from "@/components/icons";
import { listExpansions, listProducts } from "@/features/catalog/data";
import { filterProducts, hasActiveFilters, isAvailable, paginate, parseQuery, toSearchParams, type CatalogQuery, type RawParams } from "@/features/catalog/query";
import { kindSlug, languageLabel } from "@/content/schema";

export const metadata: Metadata = {
  title: "Todos los sellados",
  description: "Sobres, packs y cajas Pokémon TCG selladas. Buscá por nombre, expansión o código y filtrá por formato, idioma, disponibilidad y precio.",
};

const field = "h-12 w-full border border-ink/40 bg-white px-3 text-base sm:text-sm";
const label = "mb-1 block text-[.68rem] font-bold uppercase tracking-[.14em] text-ink/70";

function pageHref(q: CatalogQuery, page: number) {
  const s = toSearchParams({ ...q, page }).toString();
  return s ? `/sellados?${s}` : "/sellados";
}

export default async function Sellados({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const q = parseQuery(raw);
  // URL canónica: sin parámetros vacíos ni inválidos, para compartir y volver atrás con una dirección limpia.
  const canonical = toSearchParams(q);
  const current = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (Array.isArray(v) ? v : [v ?? ""]).map((x) => [k, x] as [string, string])));
  const sortKey = (u: URLSearchParams) => [...u.entries()].map(([k, v]) => `${k}=${v}`).sort().join("&");
  if (sortKey(canonical) !== sortKey(current)) redirect(canonical.toString() ? `/sellados?${canonical}` : "/sellados");
  const expansions = await listExpansions();
  // Solo se ofrecen idiomas y expansiones que tienen productos activos en el catálogo actual.
  const activos = await listProducts();
  const idiomas = Object.entries(languageLabel).filter(([k]) => k !== "na" && activos.some((p) => p.language === k)); // «No aplica» (accesorios) no es un idioma que se filtre
  const conProductos = expansions.filter((e) => activos.some((p) => p.expansionIds.includes(e.id)));
  const result = paginate(filterProducts(activos, expansions, q), q.page);
  const active = hasActiveFilters(q);
  const soloStock = q.availability === "stock";
  const stockTotal = activos.filter(isAvailable).length;
  const soloFiltroStock = soloStock && !q.q && !q.kind && !q.language && !q.expansion && q.minPrice === null && q.maxPrice === null;
  const activeCount = [q.q, q.kind, q.language, q.expansion, q.availability === "stock", q.minPrice !== null, q.maxPrice !== null].filter(Boolean).length;

  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-8 sm:py-14">
          <p className="eyebrow text-vermilion-bright">Sellados · Pokémon TCG</p>
          <h1 className="display mt-1.5 text-[clamp(2rem,9vw,6rem)] sm:mt-3">
            Explorá <span className="text-gold">tu próxima apertura</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-paper/80 sm:mt-4 sm:text-base">Sobres, packs y cajas selladas. Cada ficha te muestra qué contiene el producto y qué datos están verificados.</p>
        </div>
      </section>

      <section className="paper-texture" aria-labelledby="archivo-title">
        <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-8 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 sm:gap-y-4">
            <h2 id="archivo-title" className="display text-[clamp(1.7rem,6vw,4rem)] normal-case leading-[.95]">
              El archivo de aperturas.
            </h2>
            <nav aria-label="Vista" className="flex gap-5 text-sm font-semibold sm:gap-6">
              <span aria-current="page" className="border-b-2 border-ink pb-1">Productos</span>
              <Link href="/expansiones" className="border-b-2 border-transparent pb-1 text-ink/70 hover:border-ink hover:text-ink">Por expansión</Link>
            </nav>
          </div>

          <div className="mt-3 sm:mt-6">
            <FilterShell activeCount={activeCount}>
              <form method="get" action="/sellados" role="search" aria-label="Buscar y filtrar" className="px-4 pb-4 pt-4 lg:p-0">
                <div className="grid gap-3 lg:grid-cols-[2fr_repeat(3,1fr)]">
                  <div>
                    <label htmlFor="f-q" className={label}>Buscar</label>
                    <input id="f-q" name="q" type="search" defaultValue={q.q} placeholder="Nombre, expansión o código" maxLength={80} className={field} />
                  </div>
                  <div>
                    <label htmlFor="f-formato" className={label}>Formato</label>
                    <select id="f-formato" name="formato" defaultValue={q.kind ? kindSlug[q.kind] : ""} className={field}>
                      <option value="">Todos</option>
                      <option value="sobre">Sobres</option>
                      <option value="pack">Packs</option>
                      <option value="caja">Cajas</option>
                      <option value="bundle">Bundles</option>
                      <option value="kit">Kits de mazo</option>
                      <option value="especial">Cajas especiales</option>
                      <option value="ilustraciones">Sets de ilustraciones</option>
                      <option value="accesorios">Accesorios</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-idioma" className={label}>Idioma</label>
                    <select id="f-idioma" name="idioma" defaultValue={q.language} className={field}>
                      <option value="">Todos</option>
                      {idiomas.map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="f-expansion" className={label}>Expansión</label>
                    <select id="f-expansion" name="expansion" defaultValue={q.expansion} className={field}>
                      <option value="">Todas</option>
                      {conProductos.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <div>
                    <label htmlFor="f-pmin" className={label}>Precio mínimo ($)</label>
                    <input id="f-pmin" name="pmin" type="number" min={0} step={1} inputMode="numeric" defaultValue={q.minPrice ?? ""} className={field} />
                  </div>
                  <div>
                    <label htmlFor="f-pmax" className={label}>Precio máximo ($)</label>
                    <input id="f-pmax" name="pmax" type="number" min={0} step={1} inputMode="numeric" defaultValue={q.maxPrice ?? ""} className={field} />
                  </div>
                  <div>
                    <label htmlFor="f-orden" className={label}>Ordenar por</label>
                    <select id="f-orden" name="orden" defaultValue={q.sort} className={field}>
                      <option value="nuevos">Más recientes</option>
                      <option value="precio-asc">Precio: menor a mayor</option>
                      <option value="precio-desc">Precio: mayor a menor</option>
                    </select>
                  </div>
                  <label className="flex h-12 items-center gap-3 self-end border border-ink/40 bg-white px-3 text-sm lg:mt-0">
                    <input type="checkbox" name="disp" value="stock" defaultChecked={q.availability === "stock"} className="h-5 w-5 accent-[#0b4032]" />
                    Solo con stock
                  </label>
                  <div className="flex gap-2 self-end">
                    <button type="submit" className="h-12 flex-1 bg-ink px-6 text-sm font-bold text-paper hover:bg-emerald lg:flex-none">Aplicar</button>
                    {active && (
                      <Link href="/sellados" className="flex h-12 items-center border border-ink px-4 text-sm font-semibold hover:bg-gold">Limpiar</Link>
                    )}
                  </div>
                </div>
              </form>
            </FilterShell>
          </div>

          <FxNote className="mt-3 sm:mt-8" />
          <p className="mt-1.5 text-sm text-ink/70 sm:mt-3" role="status" aria-live="polite">
            {result.total === 0 ? "Sin resultados" : `Mostrando ${result.from}–${result.to} de ${result.total} producto${result.total === 1 ? "" : "s"}`}
          </p>

          {soloStock && (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 border-emerald bg-white/70 px-3 py-2 text-sm" data-testid="filtro-stock-activo">
              <span><b>Filtro activo: en stock.</b> Solo productos con unidades confirmadas por la tienda ({stockTotal} en total).</span>
              <Link href={pageHref({ ...q, availability: "todos" }, 1)} className="font-semibold underline hover:text-emerald">Ver también los que no tienen stock</Link>
            </p>
          )}

          {result.total === 0 && soloFiltroStock ? (
            <div className="mt-4 border border-dashed border-ink/40 bg-white/50 p-8 text-center sm:p-14" data-testid="sin-stock">
              <p className="display text-4xl normal-case sm:text-5xl">Todavía no hay productos con stock confirmado.</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">Cuando la tienda cargue unidades disponibles van a aparecer acá. Mientras tanto podés recorrer el catálogo completo y consultar por encargo: no es una compra ni una reserva, la disponibilidad y la cotización se confirman por WhatsApp.</p>
              <Link href="/sellados" className="mt-6 inline-flex items-center gap-3 bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">
                Ver todo el catálogo <ArrowIcon />
              </Link>
            </div>
          ) : result.total === 0 ? (
            <div className="mt-4 border border-dashed border-ink/40 bg-white/50 p-8 text-center sm:p-14">
              <p className="display text-4xl normal-case sm:text-5xl">No encontramos productos con esos filtros.</p>
              <p className="mx-auto mt-3 max-w-md text-sm text-ink/70">Probá con otra palabra, ampliá el rango de precio o quitá algún filtro.</p>
              <Link href="/sellados" className="mt-6 inline-flex items-center gap-3 bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">
                Limpiar filtros <ArrowIcon />
              </Link>
            </div>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-4 max-[359px]:grid-cols-1 sm:mt-4 sm:gap-5 lg:grid-cols-4">
              {result.items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          )}

          {result.pages > 1 && (
            <nav aria-label="Paginación" className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {result.page > 1 && (
                <Link href={pageHref(q, result.page - 1)} rel="prev" className="flex h-11 items-center border border-ink px-4 text-sm font-semibold hover:bg-gold">← Anterior</Link>
              )}
              {Array.from({ length: result.pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} href={pageHref(q, n)} aria-current={n === result.page ? "page" : undefined} className={`flex h-11 w-11 items-center justify-center border text-sm font-semibold ${n === result.page ? "border-ink bg-ink text-paper" : "border-ink/40 hover:bg-gold"}`}>
                  {n}
                </Link>
              ))}
              {result.page < result.pages && (
                <Link href={pageHref(q, result.page + 1)} rel="next" className="flex h-11 items-center border border-ink px-4 text-sm font-semibold hover:bg-gold">Siguiente →</Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
