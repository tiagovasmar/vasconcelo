import type { Metadata } from "next";
import { Fragment } from "react";
import { languages, type Language } from "@/content/schema";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { CardArt } from "@/components/art";
import { ProductImage, tileBg } from "@/components/product-image";
import { listExpansions, listProducts } from "@/features/catalog/data";
import { LanguageBadge } from "@/components/language-badge";
import { statusText } from "@/features/catalog/labels";

export const metadata: Metadata = {
  title: "Expansiones",
  description: "Explorá las cartas de cada expansión y descubrí qué contiene cada producto.",
};

/** Precio, stock y visibilidad salen de la base (panel /admin): la página se arma en cada pedido, no se prerenderiza. */
export const dynamic = "force-dynamic";

export default async function Expansiones() {
  const [todas, activos] = await Promise.all([listExpansions(), listProducts()]);
  const productsForExpansion = (id: string) => activos.filter((p) => p.expansionIds.includes(id));
  // Un grupo por idioma de edición (en el orden de `languages`): ninguna colección queda fuera del listado.
  const tituloGrupo: Record<Language, string> = { ja: "Ediciones japonesas", zh: "Ediciones chinas (chino simplificado)", en: "Ediciones en inglés", es: "Ediciones en español" };
  const Titulo = todas.some((e) => e.language !== todas[0].language) ? "h3" : "h2"; // con encabezados de grupo (h2) las colecciones son h3
  const grupos = languages.map((l) => ({ id: l, titulo: tituloGrupo[l], lista: todas.filter((e) => e.language === l) })).filter((g) => g.lista.length > 0);
  return (
    <>
      <section className="relative isolate overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_20%_20%,#1f8a63_0%,#0b4032_40%,#121715_85%)]" aria-hidden="true" />
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
          <p className="eyebrow text-vermilion-bright">Expansiones</p>
          <h1 className="display mt-3 text-[clamp(2.6rem,9vw,6rem)]">
            Antes de abrir, <span className="text-gold">descubrí qué puede salir.</span>
          </h1>
          <p className="mt-4 max-w-xl text-paper/80">Explorá las cartas de cada expansión y descubrí qué contiene cada producto.</p>
        </div>
      </section>
      <section className="paper-texture" aria-label="Listado de expansiones">
        <div className="mx-auto max-w-[1440px] px-4 py-12 sm:px-8">
          {grupos.map((g) => (
          <Fragment key={g.id}>
          {grupos.length > 1 && <h2 className="eyebrow mb-4 mt-12 text-vermilion first:mt-0">{g.titulo} · {g.lista.length}</h2>}
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid={`grupo-${g.id}`}>
            {g.lista.map((e, i) => {
              const count = productsForExpansion(e.id).length;
              return (
                <li key={e.id}>
                  <Link href={`/expansiones/${e.slug}`} className="group grid h-full grid-cols-[1fr_38%] gap-3 overflow-hidden border border-ink/25 bg-white/50 p-5 hover:border-ink">
                    <div className="flex min-w-0 flex-col justify-between">
                      <div>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-vermilion">{String(i + 1).padStart(2, "0")} · {e.code ? `${e.code} · ` : ""}<LanguageBadge language={e.language} size="plain" /></p>
                        <Titulo className="display mt-2 text-4xl normal-case leading-none sm:text-5xl">{e.name}</Titulo>
                        {e.originalName && <p className="mt-1 text-sm text-ink/65" data-testid="nombre-original">Nombre original: <span lang="zh-Hans" className="font-semibold">{e.originalName}</span></p>}
                        <p className="mt-3 text-sm text-ink/75">{e.summary}</p>
                      </div>
                      <div className="mt-4">
                        <p className="mono-label">{statusText[e.cardListStatus]}{e.cards.length ? ` · ${e.cards.length} cartas` : ""}</p>
                        <p className="mono-label mt-1">{count} producto{count === 1 ? "" : "s"} sellado{count === 1 ? "" : "s"}</p>
                        <span className="mt-3 inline-flex items-center gap-2 border-b border-ink pb-0.5 text-sm font-semibold group-hover:text-emerald">Ver expansión <ArrowIcon /></span>
                      </div>
                    </div>
                    <div className="img-hover flex items-center justify-center" aria-hidden="true">
                      {(() => {
                        const prods = productsForExpansion(e.id);
                        const sobre = prods.find((p) => p.kind === "booster") ?? prods[0];
                        return sobre ? (
                          <div className={`flex aspect-[3/4] w-full max-w-[170px] items-center justify-center overflow-hidden ${tileBg(sobre)}`}>
                            <ProductImage product={sobre} sizes="170px" />
                          </div>
                        ) : (
                          <CardArt tone={e.tone} label={e.code ?? e.name} className="w-full max-w-[150px] -rotate-6" />
                        );
                      })()}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          </Fragment>
          ))}
          <p className="mt-6 text-xs text-ink/60">El listado se arma a partir de los datos del catálogo. Las expansiones marcadas como ejemplo son ficticias.</p>
        </div>
      </section>
    </>
  );
}
