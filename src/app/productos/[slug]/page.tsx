import { arrivalEstimate } from "@/content/incoming-arrivals";
import { PreorderForm } from "@/components/preorder-form";
import { preorderOffers } from "@/features/importaciones/preorders";
import { publicUpcoming } from "@/features/importaciones/public-upcoming";
import type { Metadata } from "next";
import Link from "next/link";
import { catalogHref, gameLabel } from "@/content/games";
import { notFound } from "next/navigation";
import { CardGallery, type CardGroup } from "@/components/card-gallery";
import { ProductGallery } from "@/components/product-gallery";
import { ProductTags } from "@/components/product-tags";
import { AddToCartPanel } from "@/components/cart-widgets";
import { RestockNotify } from "@/components/restock-notify";
import { FavoriteButton } from "@/components/favorite-button";
import { GarantiasResumen } from "@/components/garantias-resumen";
import { maxFor } from "@/features/inquiries/pricing";
import { ProductCard } from "@/components/product-card";
import { ProductImage, tileBg } from "@/components/product-image";
import { hasAsset } from "@/components/slot";
import { store } from "@/content/store";
import { catalog } from "@/content/catalog";
import { kindLabel, type Product } from "@/content/schema";
import { getDb } from "@/db/client";
import { buildAddonCatalog } from "@/features/promos/adicionales";
import { getComboConfig } from "@/features/promos/settings";
import { getExpansion, getProductBySlug, getRetiredProductBySlug, listAllProducts, relatedProducts } from "@/features/catalog/data";
import { isAdmin } from "@/server/admin";
import { getUser } from "@/server/session";
import { StockBadge } from "@/components/stock-badge";
import { PricePerBooster } from "@/components/price-per-booster";
import { commercialState, isInStock } from "@/features/catalog/commercial";
import { Price } from "@/components/price";
import { FxNote } from "@/components/fx-note";
import { aleatoriedad, conRarezas } from "@/features/catalog/garantias";
import { evidenceLabel, formatProbability, ratesForProduct, sourcesFor, unitLabel } from "@/features/catalog/pull-rates";

/** Precio, stock y visibilidad salen de la base (panel /admin): la página se arma en cada pedido, no se prerenderiza. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const p = await getProductBySlug(slug);
  if (p) return { title: p.title, description: p.description, ...(p.addonOnly ? { robots: { index: false, follow: true } } : {}) };
  if (getRetiredProductBySlug(slug)) return { title: "Producto retirado", robots: { index: false, follow: true } };
  return { title: "Producto no encontrado" };
}

const theWord = { booster: "del sobre", pack: "del pack", box: "de la caja", bundle: "del bundle", kit: "del kit", "special-box": "de la caja especial", "illustration-set": "del set", accessory: "del producto" } as const;
const date = (iso: string) => new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const detalles = "mt-3 border border-ink/25 bg-white/60";
const resumenDetalles = "flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm font-bold";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const slug = (await params).slug;
  let product = await getProductBySlug(slug);
  // Vista previa: el administrador puede ver una ficha que todavía no está publicada (borrador u oculta). Nadie más.
  let preview = false;
  if (!product && (await searchParams).preview === "1" && isAdmin(await getUser())) {
    product = (await listAllProducts()).find((p) => p.slug === slug && !p.retired);
    preview = Boolean(product);
  }
  if (!product) {
    const retirado = getRetiredProductBySlug(slug);
    if (retirado) return <Retirado title={retirado.title} reason={retirado.retired!.reason} />;
    notFound();
  }

  const expansions = product.expansionIds.map((id) => getExpansion(id)!).filter(Boolean);
  const state = commercialState(product);
  const accessory = product.kind === "accessory";
  const guarantees = catalog.guarantees.filter((g) => product.guaranteeIds.includes(g.id));
  const rates = ratesForProduct(product, catalog.pullRates);
  const isDemo = product.isDemo || expansions.some((e) => e.isDemo);

  const sourceIds = [...new Set([...expansions.flatMap((e) => e.sourceIds), ...guarantees.flatMap((g) => g.sourceIds), ...rates.flatMap((r) => r.sourceIds), ...(product.rarityReview?.sourceIds ?? []), ...(product.nameInfo?.sourceIds ?? [])])];
  const sources = sourcesFor(sourceIds, catalog.sources);
  const reviewedDates = [...guarantees.map((g) => g.reviewedAt), ...rates.map((r) => r.reviewedAt), ...sources.map((s) => s.consultedAt), ...(product.rarityReview ? [product.rarityReview.checkedAt] : [])].sort();
  const reviewed = reviewedDates.at(-1);

  const slides = product.images.map((img, i) => ({ alt: img.alt, source: img.source ?? "manufacturer", view: img.view, node: <ProductImage product={product} index={i} sizes="(min-width:1024px) 560px, 90vw" priority={i === 0} lightPhotos />, thumb: <ProductImage product={product} index={i} sizes="(min-width:640px) 140px, 64px" lowPriority lightPhotos /> }));

  const groups: CardGroup[] = expansions.map((e) => {
    const src = e.language === "zh" ? undefined : sourcesFor(e.sourceIds, catalog.sources).find((s) => s.url.includes("pokemon-card.com")) ?? sourcesFor(e.sourceIds, catalog.sources)[0];
    return {
      expansionId: e.id, name: e.name, slug: e.slug, status: e.cardListStatus, isDemo: e.isDemo,
      officialUrl: src?.url, officialPublisher: src?.publisher, note: e.cardListNote,
      cards: e.cards.map((c) => ({ id: c.id, name: c.name, number: c.number, rarity: c.rarity, variant: c.variant, src: c.image.src, alt: c.image.alt, available: hasAsset(c.image.src), isDemo: c.isDemo })),
    };
  });

  const [related, incoming, offers] = await Promise.all([
    relatedProducts(product, 4),
    preview || product.addonOnly ? Promise.resolve(undefined) : publicUpcoming(product.id).then((items) => items.get(product.id)),
    preview || product.addonOnly ? Promise.resolve([]) : preorderOffers(getDb(), product.id),
  ]);
  // Adicionales de la ficha de una caja (sobres con 10% OFF y protectores): el servidor filtra y calcula; el navegador solo muestra.
  const addons = product.kind === "box" && state === "available"
    ? buildAddonCatalog(await listAllProducts(), (await getComboConfig(getDb())).config, product, (p) => {
        const img = p.images[0];
        return { src: img && hasAsset(img.src) ? img.src : null, alt: img?.alt ?? p.title };
      })
    : null;
  const hasCards = groups.length > 0; // los kits y cajas especiales no pertenecen a una colección: no hay galería que mostrar
  const anchors = [
    ["descripcion", "Descripción"],
    ["contenido", conRarezas(product) ? `Qué garantiza ${product.kind === "kit" ? "el kit" : theWord[product.kind].replace("del ", "el ").replace("de la ", "la ")}` : `Contenido ${theWord[product.kind]}`],
    ...(hasCards ? [["cartas", "Cartas ilustrativas"]] : []),
    ["probabilidades", "Probabilidades"],
  ];
  const navAnchors = accessory ? [["descripcion", "Descripción"], ["incluye", "Qué incluye"]] : anchors;

  return (
    <>
      {preview && <p className="bg-ink px-4 py-2 text-center text-sm font-semibold text-paper" data-testid="aviso-vista-previa">Vista previa para el administrador: esta ficha NO está publicada y nadie más puede verla.</p>}
      <div className="paper-texture border-b border-ink/15">
        <nav aria-label="Ruta" className="mx-auto max-w-[1440px] px-4 py-2 text-sm text-ink/70 sm:px-8 sm:py-3">
          <Link href="/" className="hover:underline">Inicio</Link> / <Link href={catalogHref(product.game)} className="hover:underline">{product.game && product.game !== "pokemon" ? gameLabel[product.game] : "Sellados"}</Link> / <span aria-current="page" title={product.title} className="inline-block max-w-[48vw] truncate align-bottom font-semibold text-ink sm:max-w-none">{product.title}</span>
        </nav>
      </div>

      <section className="paper-texture" aria-labelledby="producto-title">
        {/* En el celular el orden es: nombre e idioma → fotos → precio y compra → qué garantiza. En escritorio, fotos a la izquierda. */}
        <div className="mx-auto grid max-w-[1440px] gap-x-12 gap-y-2.5 px-4 py-3 sm:gap-y-4 sm:px-8 sm:py-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-y-0">
          <div className="lg:col-start-2 lg:row-start-1">
            <p className="eyebrow text-vermilion">{kindLabel[product.kind]}{product.variant ? ` · ${product.variant}` : ""}</p>
            <h1 id="producto-title" className={`display mt-2 normal-case ${product.language === "zh" ? "text-[clamp(1.5rem,3.6vw,2.8rem)] leading-tight" : "text-[clamp(1.9rem,6vw,4.2rem)] leading-[.95]"}`}>{product.title}</h1>
            {product.originalTitle && <p className="mt-2 hidden text-sm text-ink/70 sm:block" data-testid="nombre-original">Nombre original: <span lang={product.language === "zh" ? "zh-Hans" : product.language} className="font-semibold text-ink">{product.originalTitle}</span></p>}
            <ProductTags product={product} size="lg" className="mt-2 sm:mt-3" />
          </div>

          <div className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {slides.length > 0 ? <ProductGallery key={product.images.map((img) => img.src).join("|")} slides={slides} bgClass={tileBg(product)} /> : (
              <div className="tile-soft flex aspect-[4/3] items-center justify-center border border-ink/20 sm:aspect-square">
                <ProductImage product={product} />
              </div>
            )}
          </div>

          <div className="lg:col-start-2 lg:row-start-2">
            <Price product={product} size="page" />
            {accessory ? (
              <p className="mt-1 text-sm font-semibold text-ink/80" data-testid="pack-info">Precio por pack de {product.packSize} unidades. Cada compra incluye {product.packSize} unidades. Precio fijo en pesos.</p>
            ) : <FxNote className="mt-1" />}
            <PricePerBooster product={product} className="mt-1" />
            <StockBadge product={product} size="page" className="mt-1.5 sm:mt-2" />
            {(state === "available" || !offers.length) && <AddToCartPanel productId={product.id} title={product.title} imageSrc={product.images[0] && hasAsset(product.images[0].src) ? product.images[0].src : null} priceMinor={product.priceMinor ?? 0} max={maxFor(product)} state={state} stockKnown={isInStock(product)} orderOnly={Boolean(product.orderOnly)} packSize={product.packSize ?? null} addons={addons} />}
            {(incoming || offers.length > 0) && <aside className="my-4 rounded-xl border border-emerald/30 bg-emerald/10 p-4 text-sm">
              <p><strong>{incoming ? (incoming.traveling || offers.length ? "En camino" : "Próximamente") : "Preventa"}</strong>. El próximo ingreso todavía no está disponible para entrega inmediata.</p>
              {(incoming?.fromPurchase || offers.length > 0) && <p className="mt-2 font-semibold">{arrivalEstimate(product.id)}</p>}
              {offers.map((offer) => <PreorderForm key={offer.parcelId} {...offer} productPath={`/productos/${product.slug}`} />)}
              {incoming && <Link href="/proximamente" className="mt-2 inline-block font-semibold underline">Ver próximamente</Link>}
            </aside>}
            {product.stockQuantity === 0 && !product.retired && <RestockNotify productId={product.id} title={product.title} />}
            <FavoriteButton productId={product.id} title={product.title} withLabel className="mt-2 min-h-11 sm:mt-3 border border-ink/40 bg-white px-4 text-sm font-semibold hover:bg-gold" />
            <p className="mt-3 text-sm text-ink/80 sm:mt-4" data-testid="entrega"><b>Entrega:</b> Andreani · moto en CABA y AMBA · retiro en Av. Rivadavia 14600. Costo, horario y dirección exacta de retiro por WhatsApp.</p>

            {!accessory && <GarantiasResumen product={product} guarantees={guarantees} rates={rates} sources={sources} />}
            {product.language === "zh" && <p className="mt-3 text-xs text-ink/70">Edición en chino simplificado: no equivale a las ediciones japonesas ni a las internacionales.</p>}
            {isDemo && <p className="mt-3 text-xs text-ink/55">Ficha de demostración: precios, stock y algunos datos son de ejemplo.</p>}
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 border-y border-ink/20 bg-paper/95 backdrop-blur">
        <nav aria-label="Secciones de la ficha" className="mx-auto flex max-w-[1440px] gap-6 overflow-x-auto px-4 text-sm font-semibold sm:px-8">
          {navAnchors.map(([id, text]) => (
            <a key={id} href={`#${id}`} className="shrink-0 border-b-2 border-transparent py-3.5 hover:border-ink">{text}</a>
          ))}
        </nav>
      </div>

      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-10 px-4 py-8 pb-24 sm:space-y-12 sm:px-8 sm:py-14 lg:pb-14">
          <section id="descripcion" aria-labelledby="h-desc" className="scroll-mt-16 max-w-3xl">
            <h2 id="h-desc" className="display text-3xl normal-case sm:text-4xl">Qué estás comprando</h2>
            <p className="mt-3 text-base leading-relaxed sm:text-lg">{product.description}</p>
            <p className="mt-3 text-sm text-ink/80" data-testid="aleatoriedad">{product.game === "dragon-ball" && product.kind === "kit" ? "El mazo es prearmado. La carta del sobre de bonificación es aleatoria." : aleatoriedad(product)}</p>
          </section>

          {hasCards && (
            <section id="cartas" aria-labelledby="h-cartas" className="scroll-mt-16">
              <h2 id="h-cartas" className="display text-3xl normal-case sm:text-4xl">Cartas ilustrativas de la expansión</h2>
              <p className="mt-3 max-w-2xl text-sm text-ink/70"><b>Son cartas ilustrativas de la expansión, no contenido garantizado</b>: el contenido de cada sobre es aleatorio y las cartas no se venden sueltas en esta tienda.{expansions.length > 1 ? " Este pack mezcla expansiones: las cartas se muestran agrupadas por cada una." : ""}</p>
              <div className="mt-6"><CardGallery groups={groups} /></div>
            </section>
          )}

          {accessory && <AccesorioIncluye product={product} />}

          {!accessory && (<section id="probabilidades" aria-labelledby="h-prob" className="scroll-mt-16 max-w-4xl">
            <h2 id="h-prob" className="display text-3xl normal-case sm:text-4xl">Probabilidades</h2>
            {/* Un solo desplegable: cerrado mientras no haya datos (el título ya dice «dato no disponible»), abierto si hay una tabla verificada. */}
            <details open={rates.length > 0} className={detalles} data-testid="probabilidades-detalle">
              <summary className={resumenDetalles}>{rates.length === 0 ? "Dato no disponible: no hay tasas de aparición verificadas" : "Ver tabla de probabilidades"} <span aria-hidden="true">▾</span></summary>
              <div className="border-t border-ink/15 p-4">
                {rates.length === 0 ? (
                  <p className="text-sm"><b>Dato no disponible.</b> No hay tasas de aparición cargadas para este formato, idioma y región. Una tasa por sobre no se traslada a una caja, ni entre idiomas o regiones. No es lo mismo una probabilidad que una cantidad garantizada por caja.</p>
                ) : (
                  <>
                    <div className="hidden md:block">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">Probabilidades por rareza o carta</caption>
                        <thead><tr className="border-b border-ink/30 text-xs uppercase tracking-wider text-ink/70"><th scope="col" className="py-2 pr-4">Objetivo</th><th scope="col" className="py-2 pr-4">Unidad</th><th scope="col" className="py-2 pr-4">Probabilidad</th><th scope="col" className="py-2 pr-4">Evidencia</th><th scope="col" className="py-2">Revisión</th></tr></thead>
                        <tbody>
                          {rates.map((r) => (
                            <tr key={r.id} className="border-b border-ink/10 align-top">
                              <th scope="row" className="py-3 pr-4 font-semibold">{r.target.kind === "rarity" ? "Rareza" : "Carta"}: {r.target.id}</th>
                              <td className="py-3 pr-4">{unitLabel[r.unit]}</td>
                              <td className="py-3 pr-4 font-bold">{formatProbability(r.probability)}</td>
                              <td className="py-3 pr-4">{evidenceLabel[r.evidence]}<RateDetail r={r} /></td>
                              <td className="py-3">{date(r.reviewedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="space-y-3 md:hidden">
                      {rates.map((r) => (
                        <li key={r.id} className="border border-ink/20 bg-white p-3 text-sm">
                          <p className="font-semibold">{r.target.kind === "rarity" ? "Rareza" : "Carta"}: {r.target.id} · {unitLabel[r.unit]}</p>
                          <p className="mt-1 text-lg font-bold">{formatProbability(r.probability)}</p>
                          <p className="text-ink/70">{evidenceLabel[r.evidence]} · revisado el {date(r.reviewedAt)}</p>
                          <RateDetail r={r} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <ul className="mt-4 space-y-1 border-t border-ink/15 pt-3 text-xs text-ink/70">
                  <li><b>Oficial</b> es un dato publicado por la fuente. <b>Observada</b> es una estimación con muestra y método a la vista, no una garantía.</li>
                  <li>«Dato no disponible» significa que no hay evidencia suficiente: no equivale a 0 %.</li>
                  <li>Una garantía de composición (por ejemplo, «1 carta ex por sobre») no es la probabilidad de cada carta ni se reparte entre ellas.</li>
                  <li>Una tasa por rareza no es la de una carta concreta, y una tasa por sobre no se convierte en tasa por caja.</li>
                </ul>
              </div>
            </details>
          </section>)}

          {!accessory && (<section aria-labelledby="h-fuentes" className="max-w-4xl">
            <h2 id="h-fuentes" className="display text-3xl normal-case sm:text-4xl">Fuentes</h2>
            <details className={detalles} data-testid="fuentes-detalle">
              <summary className={resumenDetalles}>{sources.length === 0 ? "Sin fuente cargada" : `Fuentes y fecha de revisión (${sources.length})`} <span aria-hidden="true">▾</span></summary>
              <div className="border-t border-ink/15 p-4">
                {sources.length === 0 ? (
                  <p className="text-sm">Este producto todavía no tiene una fuente cargada.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {sources.map((s) => (
                      <li key={s.id} className="border-l-4 border-emerald pl-3">
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-emerald">{s.publisher} ↗</a>
                        <p className="text-ink/75">{s.scope}</p>
                        {s.note && <p className="text-ink/60">{s.note}</p>}
                        <p className="text-xs text-ink/60">Consultada el {date(s.consultedAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
                {reviewed && <p className="mt-3 text-sm">Información revisada por última vez el <b>{date(reviewed)}</b>.</p>}
                {product.language === "zh" && <p className="mt-2 text-xs text-ink/70">{product.game === "one-piece" ? "El catálogo de Bandai identifica la edición. Las imágenes y el formato de venta corresponden a la referencia del proveedor." : "Los datos de esta ficha provienen de publicaciones del proveedor y de las fotos de su envase, no de una ficha oficial. Las imágenes son de referencia del proveedor."}</p>}
                <p className="mt-2 text-xs text-ink/55">{store.name} no es una tienda oficial de {gameLabel[product.game ?? "pokemon"]}.</p>
              </div>
            </details>
          </section>)}

          {related.length > 0 && (
            <section aria-labelledby="h-rel">
              <h2 id="h-rel" className="display text-3xl normal-case sm:text-4xl">Otros sellados de esta expansión</h2>
              <ul className="mt-6 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">
                {related.map((p: Product) => (<li key={p.id}><ProductCard product={p} lowPriority /></li>))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** Qué incluye la compra de un accesorio: pack de N unidades, sin cartas y sin datos inventados (marca, medidas, espesor, material). */
function AccesorioIncluye({ product }: { product: Product }) {
  const toploader = product.id.startsWith("top-loaders");
  return (
    <section id="incluye" aria-labelledby="h-incluye" className="scroll-mt-16 max-w-3xl" data-testid="accesorio-incluye">
      <h2 id="h-incluye" className="display text-3xl normal-case sm:text-4xl">Qué incluye tu compra</h2>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-base leading-relaxed">
        <li>Cada unidad que comprás es <b>un pack de {product.packSize} unidades</b>: si agregás 2 al carrito, son 2 packs ({(product.packSize ?? 0) * 2} unidades). El stock también se cuenta en packs.</li>
        {toploader && <li>Los top loaders se usan <b>junto con una sleeve</b>: la carta va primero en la sleeve y después en el top loader.</li>}
        <li>No incluye cartas.</li>
        <li>No tenemos confirmados la marca, las medidas, el espesor ni el material específico: no los indicamos para no inventarlos.</li>
        <li>La imagen es una <b>ilustración generada</b> que muestra <b>una sola unidad</b> del tipo de protector; no es una foto del stock real. Lo que se vende es el pack de {product.packSize} unidades.</li>
      </ul>
    </section>
  );
}

/** Ficha de un producto retirado de la oferta pública: no se vende ni se encarga; se explica y se ofrece volver al catálogo. */
function Retirado({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="paper-texture">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-8 sm:py-20" data-testid="producto-retirado">
        <p className="eyebrow text-vermilion">Producto retirado</p>
        <h1 className="display mt-3 text-[clamp(1.8rem,5vw,3.2rem)] normal-case leading-tight">{title}</h1>
        <p className="mt-4 text-lg">Este producto <b>fue retirado de la tienda</b>: ya no se puede comprar ni consultar por encargo.</p>
        <p className="mt-2 text-sm text-ink/70">{reason}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sellados" className="bg-gold px-6 py-3.5 font-bold hover:bg-ink hover:text-paper">Ver el catálogo</Link>
          <Link href="/expansiones" className="border border-ink px-6 py-3.5 font-semibold hover:bg-ink hover:text-paper">Ver las colecciones</Link>
        </div>
      </div>
    </div>
  );
}

function RateDetail({ r }: { r: import("@/content/schema").PullRate }) {
  if (r.evidence === "unavailable") return <p className="text-xs text-ink/60">Sin fuente verificada.</p>;
  return (
    <p className="mt-1 text-xs text-ink/70">
      {r.evidence === "observed" && <>Muestra: {r.observedHits} de {r.sampleSize} {r.sampleUnit}. {r.interval ? `Intervalo ${formatProbability(r.interval.low)}–${formatProbability(r.interval.high)} (${r.interval.method}). ` : ""}Método: {r.method}. </>}
      Fuente: {sourcesFor(r.sourceIds, catalog.sources).map((s) => s.publisher).join(", ")}.
    </p>
  );
}
