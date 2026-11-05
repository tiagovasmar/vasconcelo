import { arrivalEstimate } from "@/content/incoming-arrivals";
import Link from "next/link";
import { store } from "@/content/store";
import { SafeImage } from "@/components/safe-image";
import { ArrowIcon, CartIcon, ChatIcon, CubeIcon } from "@/components/icons";
import { HomeCarousel } from "@/components/home-carousel";
import { banners } from "@/content/banners";
import { ProductCard } from "@/components/product-card";
import { FxNote } from "@/components/fx-note";
import { ProductImage } from "@/components/product-image";
import { featuredProducts, inStockProducts, listProducts, listExpansions } from "@/features/catalog/data";
import { PaymentBenefits, PromoStrip } from "@/components/payment-benefits";
import { hasAsset } from "@/components/slot";

import { kindSlug, type Expansion, type Product } from "@/content/schema";
import { LanguageBadge } from "@/components/language-badge";
import { getDb } from "@/db/client";
import { incomingProducts } from "@/features/importaciones/service";

/** Colecciones japonesas del inicio (las ocho originales, en el orden del catálogo). */
const COLECCIONES_JA_INICIO = ["black-bolt", "white-flare", "heat-wave-arena", "inferno-x", "mega-dream-ex", "30th-celebration", "storm-emeralda", "abyss-eye"];

/** Un producto por id de expansión, en el orden indicado (los ids ausentes se omiten). */
function pickFor(products: Product[], kind: Product["kind"], expansionIds: string[]): Product[] {
  return expansionIds.map((id) => products.find((p) => p.kind === kind && p.expansionIds.includes(id))).filter((p): p is Product => p !== undefined);
}

/** Foto de producto con su proporción real: todas comparten la misma altura y cada una toma el ancho de su forma, así no se estira ni se recorta. */
function Shot({ product, index = 0, priority = false, sizes, className = "" }: { product: Product; index?: number; priority?: boolean; sizes: string; className?: string }) {
  const img = product.images[index] ?? product.images[0];
  return (
    <div className={`img-hover flex h-full min-w-0 shrink items-center justify-center ${className}`} style={{ aspectRatio: `${img.width} / ${img.height}` }}>
      <ProductImage product={product} index={index} priority={priority} className="h-full w-full object-contain" sizes={sizes} />
    </div>
  );
}

/** Acceso con flecha (texto + chip dorado). */
function ArrowLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`link-arrow ${className}`}>{children}<span className="chip" aria-hidden="true"><ArrowIcon className="h-3.5 w-3.5" /></span></Link>;
}

/** Precio, stock y visibilidad salen de la base (panel /admin): la página se arma en cada pedido, no se prerenderiza. */
export const dynamic = "force-dynamic";

export default async function Home() {
  const [products, enStock, expansions, destacados, incoming] = await Promise.all([listProducts(), inStockProducts(), listExpansions(), featuredProducts(4), incomingProducts(getDb())]);
  const upcoming = products.filter((product) => incoming.has(product.id));
  // Un banner por colección que exista en el catálogo (arranca con Storm Emeralda).
  const slides = banners.filter((b) => expansions.some((e) => e.id === b.expansionId));
  // Cajas: Inferno X y MEGA Dream ex. Sobres: Black Bolt y White Flare. (Con respaldo por formato si faltara alguna.)
  const fill = (kind: Product["kind"], ids: string[], n: number) => {
    const chosen = pickFor(products, kind, ids);
    for (const p of products) if (chosen.length < n && p.kind === kind && !chosen.includes(p)) chosen.push(p);
    return chosen.slice(0, n);
  };
  const catBoxes = fill("box", ["inferno-x", "mega-dream-ex"], 2);
  const catBoosters = fill("booster", ["black-bolt", "white-flare"], 2);
  // «Packs» solo es un acceso mientras exista al menos un producto de ese formato; si no, es una franja «Próximamente» sin enlace.
  const hasPacks = products.some((p) => p.kind === "pack");
  const withProduct = (list: Expansion[]) => list.map((e) => ({ expansion: e, product: products.find((p) => p.kind === "box" && p.expansionIds.includes(e.id)) ?? products.find((p) => p.kind === "booster" && p.expansionIds.includes(e.id)) ?? products.find((p) => p.expansionIds.includes(e.id)) })).filter((e) => e.product !== undefined);
  // Colecciones del inicio: las ocho japonesas y una selección de las de mejor imagen de otras ediciones, todas en el mismo listado y con su idioma
  // a la vista (bandera y nombre). El resto de las colecciones se recorre desde «Ver cartas de cada colección» y el catálogo con el filtro de idioma.
  const destacadasZh = ["zh-taijing-shengju", "zh-xingcai-jingli", "zh-cuican-guihuan", "zh-30-zhounian"];
  const collections = [
    // (solo las ocho japonesas originales: las cajas agregadas después no se suman al inicio)
    ...withProduct(expansions.filter((e) => COLECCIONES_JA_INICIO.includes(e.id))),
    // en las chinas se prefiere el sobre: sus fotos son más nítidas que las de las cajas del proveedor
    ...destacadasZh.flatMap((id) => expansions.filter((e) => e.id === id).map((e) => ({ expansion: e, product: products.find((p) => p.kind === "booster" && p.expansionIds.includes(e.id)) ?? products.find((p) => p.expansionIds.includes(e.id)) })).filter((x) => x.product !== undefined)),
  ];
  // Formatos especiales (kits de mazo, cajas especiales, sets de ilustraciones): solo si hay productos reales de ese formato.
  const especiales = (["kit", "special-box", "illustration-set"] as const)
    .map((kind) => ({ kind, list: products.filter((p) => p.kind === kind) }))
    .filter((x) => x.list.length > 0);
  const especialTitulo = { kit: "Kits de mazo", "special-box": "Cajas especiales", "illustration-set": "Sets de ilustraciones" } as const;
  const especialTexto = { kit: "Para armar y jugar un mazo", "special-box": "Cajas temáticas con sobres y accesorios", "illustration-set": "Carta de ilustración y marco" } as const;
  const showcase = expansions.find((e) => e.id === "storm-emeralda") ?? expansions.find((e) => e.id === "black-bolt") ?? expansions[0];
  // Cartas destacadas: las más raras de la expansión, en el orden de rareza.
  const withImage = showcase?.cards.filter((c) => hasAsset(c.image.src)) ?? [];
  const order = ["MUR", "SAR", "BWR", "UR", "SR", "AR"];
  const rare = order.flatMap((r) => withImage.filter((c) => c.rarity === r)).slice(0, 3);
  const cards = rare.length === 3 ? rare : withImage.slice(0, 3);
  const stage = "flex h-40 items-center justify-center gap-3 tile-soft px-3 py-3 sm:h-60 sm:gap-6 sm:px-6 sm:py-4";
  const foot = "flex items-center justify-between gap-2 border-t border-gold/50 bg-paper p-3 sm:p-4";
  return (
    <>
      <h1 className="sr-only">Productos sellados de Pokémon TCG en ediciones japonesas y chinas</h1>
      <HomeCarousel banners={slides} />

      <section aria-labelledby="whatsapp-group-title" className="border-y border-gold/30 bg-emerald text-paper" data-testid="grupo-whatsapp">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper/10 text-gold" aria-hidden="true"><ChatIcon /></span>
            <div className="min-w-0">
              <h2 id="whatsapp-group-title" className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">Sumate al grupo de Vasconcelo</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-paper/85">Enterate de ofertas limitadas, sorteos, cupones y novedades.</p>
            </div>
          </div>
          <a href={store.whatsappGroupUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="relative inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 text-center text-sm font-bold text-ink transition hover:bg-paper focus-visible:outline-paper lg:shrink-0" data-testid="unirse-grupo-whatsapp">
            Unirme al grupo de WhatsApp<ArrowIcon className="h-4 w-4 shrink-0" />
            <span className="sr-only"> (se abre en una pestaña nueva)</span>
          </a>
        </div>
      </section>

      {enStock.length > 0 ? (
        <section aria-labelledby="stock-title" className="border-b border-ink/10 bg-white" data-testid="home-en-stock">
          <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-11">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div><p className="eyebrow kicker text-emerald">Para entrega inmediata</p><h2 id="stock-title" className="title-rule mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">En stock.</h2></div>
              <ArrowLink href="/sellados?disp=stock">Ver todo lo que hay en stock ({enStock.length})</ArrowLink>
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">{enStock.slice(0, 4).map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul>
          </div>
        </section>
      ) : (
        <section aria-label="En stock" className="border-b border-ink/10 bg-white" data-testid="home-en-stock-vacio">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-0.5 px-4 py-2 text-xs sm:py-3 sm:text-sm sm:px-8">
            <p className="text-ink/75"><b className="font-semibold text-ink">En stock:</b> todavía no hay unidades confirmadas. Mirá el catálogo y consultá por encargo.</p>
            <Link href="/sellados?disp=stock" className="font-semibold underline hover:text-emerald">Ver En stock</Link>
          </div>
        </section>
      )}

      {upcoming.length > 0 && <section aria-labelledby="upcoming-title" className="border-b border-ink/10 bg-white" data-testid="home-proximamente">
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-11">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div><p className="eyebrow kicker text-emerald">Nuestros próximos ingresos</p><h2 id="upcoming-title" className="title-rule mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Próximamente.</h2></div>
            <ArrowLink href="/proximamente">Ver todos los próximos ingresos ({upcoming.length})</ArrowLink>
          </div>
          <p className="mt-3 text-sm text-ink/75">Estas cajas todavía no están disponibles para entrega inmediata.</p>
          <ul className="mt-5 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">
            {upcoming.map((product) => <li key={product.id} className="min-w-0 overflow-hidden rounded-xl border border-ink/15 bg-white">
              <Link href={`/productos/${product.slug}`} className="group flex h-full flex-col">
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-paper-2 p-3"><ProductImage product={product} className="h-full w-full object-contain" sizes="(min-width:1024px) 320px, 45vw" /></div>
                <div className="flex flex-1 flex-col p-3 sm:p-4">
                  <span className="self-start rounded-full bg-emerald px-2.5 py-1 text-xs font-semibold text-white">{incoming.get(product.id)!.traveling > 0 ? "En camino" : "Próximamente"}</span>
                  <h3 className="mt-3 break-words text-sm font-semibold sm:text-base">{product.title}</h3>
                  <p className="mt-2 text-sm text-ink/75">{arrivalEstimate(product.id)}</p>
                  <span className="mt-4 text-sm font-semibold underline">Ver producto ↗</span>
                </div>
              </Link>
            </li>)}
          </ul>
        </div>
      </section>}

      <section aria-labelledby="cat-title" className="bg-paper">
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 sm:py-11">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div><p className="eyebrow kicker text-emerald">Formatos</p><h2 id="cat-title" className="title-rule mt-2 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">¿Qué querés abrir?</h2></div>
            <ArrowLink href="/sellados">Ver todo el catálogo</ArrowLink>
          </div>
          <PromoStrip />
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:gap-5">
            <li className="min-w-0">
              <Link href="/sellados?formato=caja" className="panel-cut group h-full" data-testid="categoria-cajas">
                <div className="panel-cut-in flex flex-col">
                  <div className={stage}>{catBoxes.map((p) => <Shot key={p.id} product={p} sizes="(min-width:1024px) 300px, 45vw" />)}</div>
                  <div className={foot}><div><h3 className="text-lg font-semibold sm:text-xl">Cajas</h3><p className="text-xs text-ink/70 sm:text-sm">Cajas selladas completas</p></div><ArrowIcon className="h-4 w-4 shrink-0 text-emerald" /></div>
                </div>
              </Link>
            </li>
            <li className="min-w-0">
              <Link href="/sellados?formato=sobre" className="panel-cut group h-full" data-testid="categoria-sobres">
                <div className="panel-cut-in flex flex-col">
                  <div className={stage}>{catBoosters.map((p) => <Shot key={p.id} product={p} sizes="(min-width:1024px) 160px, 30vw" />)}</div>
                  <div className={foot}><div><h3 className="text-lg font-semibold sm:text-xl">Sobres</h3><p className="text-xs text-ink/70 sm:text-sm">Sobres individuales</p></div><ArrowIcon className="h-4 w-4 shrink-0 text-emerald" /></div>
                </div>
              </Link>
            </li>
          </ul>
          {hasPacks ? (
            <Link href="/sellados?formato=pack" className="panel-cut mt-3 sm:mt-5" data-testid="categoria-packs"><div className="panel-cut-in flex items-center justify-between gap-3 bg-white px-4 py-3 sm:px-5"><span className="font-semibold">Packs</span><ArrowIcon className="h-4 w-4 text-emerald" /></div></Link>
          ) : (
            <div className="panel-cut mt-3 [--c:12px] sm:mt-5" data-testid="categoria-packs">
              <div className="panel-cut-in flex items-center justify-between gap-3 bg-paper px-4 py-3 text-ink sm:px-5">
                <p className="text-sm"><span className="font-semibold">Packs</span> <span className="text-ink/70">· todavía no hay packs en el catálogo</span></p>
                <span className="shrink-0 rounded-full border border-gold bg-white px-3 py-1 text-xs font-medium text-emerald">Próximamente</span>
              </div>
            </div>
          )}
          {especiales.length > 0 && (
            <ul className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 sm:mt-5 sm:gap-5" aria-label="Más formatos" data-testid="formatos-especiales">
              {especiales.map(({ kind, list }) => (
                <li key={kind} className="min-w-0">
                  <Link href={`/sellados?formato=${kindSlug[kind]}`} className="panel-cut group h-full" data-testid={`formato-${kindSlug[kind]}`}>
                    <div className="panel-cut-in flex items-center gap-3 bg-white p-3 sm:p-4">
                      <div className="img-hover flex h-20 w-24 shrink-0 items-center justify-center tile-soft p-1.5 sm:h-24 sm:w-28">{list[0] && <Shot product={list[0]} sizes="112px" />}</div>
                      <div className="min-w-0 flex-1"><h3 className="text-base font-semibold leading-tight sm:text-lg">{especialTitulo[kind]}</h3><p className="mt-0.5 text-xs text-ink/70 sm:text-sm">{especialTexto[kind]}</p><p className="mt-1 text-xs text-ink/60">{list.length} {list.length === 1 ? "producto" : "productos"}</p></div>
                      <ArrowIcon className="h-4 w-4 shrink-0 text-emerald" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink/70 sm:text-sm">Envíos a todo el país · Retiro en Av. Rivadavia 14600 (horario por WhatsApp)</p>
        </div>
      </section>

      <section className="relative isolate overflow-hidden bg-[#04130d] text-paper" aria-labelledby="cards-title">
        <div className="hero-slab absolute inset-0 -z-10 opacity-70" aria-hidden="true" />
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-4 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="eyebrow kicker text-gold">Antes de abrir</p>
            <h2 id="cards-title" className="title-rule mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Las cartas que<br /><span className="text-gold">querés encontrar.</span></h2>
            <p className="mt-5 max-w-md leading-relaxed text-paper/80">Recorré las galerías, rarezas y contenido de cada colección. Pasá el mouse o enfocá una carta para verla más de cerca.</p>
            <ArrowLink href={showcase ? `/expansiones/${showcase.slug}` : "/expansiones"} className="mt-6 text-gold">Explorar las cartas</ArrowLink>
          </div>
          <ul className="mx-auto flex w-full max-w-xl items-center justify-center gap-3 py-6 sm:gap-6" aria-label="Cartas destacadas" data-testid="cartas-destacadas">
            {cards.map((c, i) => (
              <li key={c.id} className={`w-[31%] ${i === 1 ? "relative z-10 -translate-y-3" : ""}`}>
                <Link href={showcase ? `/expansiones/${showcase.slug}` : "/expansiones"} aria-label={`${c.name}, carta ${c.number} de ${showcase?.name ?? ""}: ver la galería`} className={`card-zoom block overflow-hidden rounded-xl ${i === 0 ? "-rotate-6" : i === 2 ? "rotate-6" : ""}`}>
                  <SafeImage src={c.image.src} alt={c.image.alt} width={c.image.width} height={c.image.height} sizes="(min-width:1024px) 200px, 30vw" className="h-auto w-full" fallback={<div role="img" aria-label={c.image.alt} className="w-full bg-ink/30" style={{ aspectRatio: `${c.image.width} / ${c.image.height}` }} />} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-white" aria-labelledby="collections-title">
        <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow kicker text-emerald">Colecciones</p><h2 id="collections-title" className="title-rule mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Elegí tu colección.</h2></div><ArrowLink href="/expansiones">Ver cartas de cada colección</ArrowLink></div>
          <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {collections.map(({ expansion: e, product: p }) => <li key={e.id} className="min-w-0"><Link href={`/sellados?expansion=${e.id}`} className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-ink/10 bg-white transition hover:border-gold hover:shadow-md" aria-label={`${e.name}: ver productos`}>
              <div className="flex h-40 items-center justify-center overflow-hidden tile-soft px-3 py-3 sm:h-48"><Shot product={p!} sizes="(min-width:1024px) 280px, (min-width:640px) 30vw, 45vw" /></div>
              <div className="flex flex-1 items-center justify-between gap-2 border-t border-gold/50 bg-paper p-3 sm:p-4"><div className="min-w-0"><h3 className="text-sm font-semibold leading-tight sm:text-base">{e.name}</h3><p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink/65">{e.code ? `${e.code} · ` : ""}<LanguageBadge language={e.language} size="plain" /></p></div><ArrowIcon className="h-4 w-4 shrink-0 text-emerald" /></div>
            </Link></li>)}
          </ul>
        </div>
      </section>

      <section className="border-t border-ink/10 bg-paper" aria-labelledby="feat-title"><div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow kicker text-emerald">En el catálogo</p><h2 id="feat-title" className="title-rule mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Para tu próxima apertura.</h2></div><ArrowLink href="/sellados">Ver todos los productos</ArrowLink></div><FxNote className="mt-4" /><ul className="mt-5 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1 sm:gap-5 lg:grid-cols-4">{destacados.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul></div></section>

      <section className="border-y border-ink/10 bg-white" aria-labelledby="may-home-title" data-testid="llamada-mayoristas">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-4 py-8 sm:px-8 sm:py-10">
          <div className="max-w-2xl">
            <p className="eyebrow kicker text-emerald">Mayoristas</p>
            <h2 id="may-home-title" className="title-rule mt-3 text-xl font-semibold leading-tight tracking-tight sm:text-2xl">¿Comprás por mayor? Pedidos por cantidad, con precio por tramo.</h2>
            <p className="mt-3 text-sm text-ink/70">Solicitá tu cuenta mayorista: la tienda la aprueba a mano y los precios dependen de la cantidad. Los pedidos son siempre por encargo; las condiciones (compra mínima y demoras) las define la tienda.</p>
          </div>
          <ArrowLink href="/mayoristas">Ver mayoristas</ArrowLink>
        </div>
      </section>

      <section className="bg-paper" aria-labelledby="how-title"><div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-8 sm:py-14"><p className="eyebrow kicker text-emerald">Simple, de principio a fin</p><h2 id="how-title" className="title-rule mt-3 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">Armás el pedido. Lo coordinamos.</h2><ol className="mt-7 grid gap-4 md:grid-cols-3">{[{ icon: <CartIcon />, title: "Elegí tus productos", text: "Agregá sobres y cajas al carrito." }, { icon: <ChatIcon />, title: "Continuá por WhatsApp", text: "Enviá el pedido con tu entrega y preferencia de pago." }, { icon: <CubeIcon />, title: "Recibí tu próxima apertura", text: "Andreani, moto en CABA y AMBA o retiro por la zona." }].map((s, i) => <li key={s.title} className="rounded-xl border border-ink/10 bg-white p-5"><div className="flex items-center justify-between text-emerald">{s.icon}<span className="text-xs font-semibold">0{i + 1}</span></div><h3 className="mt-4 text-lg font-bold">{s.title}</h3><p className="mt-2 text-sm leading-relaxed text-ink/70">{s.text}</p></li>)}</ol><div className="mt-6"><PaymentBenefits /><p className="mt-3 text-xs text-ink/65">Disponibilidad, importe final y entrega se confirman en el chat. <Link href="/como-comprar" className="underline">Cómo comprar</Link></p></div></div></section>
    </>
  );
}
