import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionBanner } from "@/components/collection-banner";
import { getBanner } from "@/content/banners";
import { CardGallery } from "@/components/card-gallery";
import { ProductCard } from "@/components/product-card";
import { FxNote } from "@/components/fx-note";
import { hasAsset } from "@/components/slot";
import { catalog } from "@/content/catalog";
import { LanguageBadge } from "@/components/language-badge";
import { getExpansionBySlug, productsForExpansion } from "@/features/catalog/data";
import { sourcesFor } from "@/features/catalog/pull-rates";
import { statusText } from "@/features/catalog/labels";

/** Precio, stock y visibilidad salen de la base (panel /admin): la página se arma en cada pedido, no se prerenderiza. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getExpansionBySlug((await params).slug);
  return e ? { title: e.name, description: e.summary } : { title: "Expansión no encontrada" };
}

export default async function ExpansionPage({ params }: { params: Promise<{ slug: string }> }) {
  const e = getExpansionBySlug((await params).slug);
  if (!e) notFound();
  const sources = sourcesFor(e.sourceIds, catalog.sources);
  // La «fuente oficial» solo existe donde hay una fuente del fabricante; las ediciones chinas citan publicaciones de proveedores (se listan abajo, en Fuentes).
  const official = e.language === "zh" ? undefined : sources.find((s) => s.url.includes("pokemon-card.com")) ?? sources[0];
  const related = await productsForExpansion(e.id);
  const banner = getBanner(e.id);
  const group = {
    expansionId: e.id, name: e.name, slug: e.slug, status: e.cardListStatus, isDemo: e.isDemo,
    officialUrl: official?.url, officialPublisher: official?.publisher, note: e.cardListNote,
    cards: e.cards.map((c) => ({ id: c.id, name: c.name, number: c.number, rarity: c.rarity, variant: c.variant, src: c.image.src, alt: c.image.alt, available: hasAsset(c.image.src), isDemo: c.isDemo })),
  };

  return (
    <>
      <nav aria-label="Ruta" className="border-b border-ink/10 bg-paper text-sm text-ink/70"><div className="mx-auto max-w-[1440px] px-4 py-3 sm:px-8"><Link href="/expansiones" className="underline underline-offset-4 hover:text-emerald">Expansiones</Link> / <span aria-current="page">{e.name}</span></div></nav>
      {banner ? (
        <CollectionBanner banner={banner} as="h1" priority productsHref="#exp-prods" galleryHref="#exp-cartas" meta={<><p className="mt-3 max-w-md text-xs leading-relaxed text-paper/75">{e.summary}</p><p className="mono-label mt-3 text-gold">{statusText[e.cardListStatus]}{e.cards.length ? ` · ${e.cards.length} cartas` : ""}{e.isDemo ? " · expansión de ejemplo" : ""}</p></>} />
      ) : (
        <section className="relative isolate overflow-hidden bg-ink text-paper">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
          <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
          <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
                      <p className="eyebrow mt-5 flex flex-wrap items-center gap-x-1.5 text-vermilion-bright">{e.code ? `${e.code} · ` : ""}<LanguageBadge language={e.language} size="plain" className="text-inherit" /> · {e.region}</p>
            <h1 className="display mt-3 text-[clamp(2.8rem,10vw,7rem)]">{e.name}</h1>
            {e.originalName && <p className="mt-2 text-paper/80" data-testid="nombre-original">Nombre original: <span lang="zh-Hans" className="font-semibold text-paper">{e.originalName}</span></p>}
            <p className="mt-4 max-w-2xl text-paper/80">{e.summary}</p>
            <p className="mono-label mt-5 text-gold">{statusText[e.cardListStatus]}{e.cards.length ? ` · ${e.cards.length} cartas` : ""}{e.isDemo ? " · expansión de ejemplo" : ""}</p>
          </div>
        </section>
      )}

      <div className="paper-texture">
        <div className="mx-auto max-w-[1440px] space-y-16 px-4 py-12 sm:px-8 sm:py-16">
          <section aria-labelledby="exp-cartas">
            <p className="eyebrow text-vermilion">01 / Cartas</p>
            <h2 id="exp-cartas" className="display mt-2 text-4xl normal-case sm:text-5xl">Cartas de la expansión</h2>
            <p className="mt-3 max-w-2xl text-sm text-ink/70">Información para explorar el contenido del set. Las cartas no se venden sueltas en esta tienda.</p>
            <div className="mt-6"><CardGallery groups={[group]} /></div>
          </section>

          <section aria-labelledby="exp-prods">
            <p className="eyebrow text-vermilion">02 / Sellados</p>
            <h2 id="exp-prods" className="display mt-2 text-4xl normal-case sm:text-5xl">Productos de esta expansión</h2>
            {related.length === 0 ? (
              <p className="mt-4 text-sm">Por ahora no hay productos sellados de esta expansión. <Link href="/sellados" className="underline">Ver todos los sellados</Link>.</p>
            ) : (
              <><FxNote className="mt-4" /><ul className="mt-6 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">
                {related.map((p) => (<li key={p.id}><ProductCard product={p} /></li>))}
              </ul></>
            )}
          </section>

          <section aria-labelledby="exp-fuentes" className="max-w-3xl">
            <h2 id="exp-fuentes" className="display text-3xl normal-case sm:text-4xl">Fuentes</h2>
            {sources.length === 0 ? (
              <p className="mt-3 text-sm">Esta expansión no tiene fuente oficial cargada.</p>
            ) : (
              <ul className="mt-3 space-y-3 text-sm">
                {sources.map((s) => (
                  <li key={s.id} className="border-l-4 border-emerald pl-3">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-emerald">{s.publisher} ↗</a>
                    <p className="text-ink/75">{s.scope}</p>
                    <p className="text-xs text-ink/60">Consultada el {new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(s.consultedAt + "T00:00:00Z"))}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
