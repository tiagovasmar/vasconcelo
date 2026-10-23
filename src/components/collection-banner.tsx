import Link from "next/link";
import { SafeImage } from "./safe-image";
import type { CSSProperties, ReactNode } from "react";
import type { Banner } from "@/content/banners";
import { ArrowIcon } from "./icons";

/** Parte el título en hasta dos líneas equilibradas y elige un tamaño según la línea más larga. */
function titleLines(title: string): { lines: string[]; size: string } {
  const words = title.split(" ");
  let lines = [title];
  if (words.length > 1 && title.length > 10) {
    let best = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
      const d = Math.abs(a.length - b.length);
      if (d < best) { best = d; lines = [a, b]; }
    }
  }
  const longest = Math.max(...lines.map((l) => l.length));
  const size = longest <= 8 && lines.length > 1 ? "text-[clamp(1.9rem,8vw,5.6rem)]" : longest <= 11 ? "text-[clamp(1.7rem,6.6vw,4.7rem)]" : "text-[clamp(1.55rem,5.8vw,3.9rem)]";
  return { lines, size };
}

/**
 * Banner de una colección: composición propia (CSS/SVG + recursos registrados). Texto y botones son componentes reales.
 * `loadImages=false` reserva el espacio sin pedir las imágenes (el carrusel las carga cuando el banner está por mostrarse).
 */
export function CollectionBanner({ banner: b, as: H = "h2", priority = false, loadImages = true, productsHref, galleryHref, meta, bottomSpace = false, className = "" }: {
  banner: Banner; as?: "h1" | "h2"; priority?: boolean; loadImages?: boolean; productsHref?: string; galleryHref?: string; meta?: ReactNode; bottomSpace?: boolean; className?: string;
}) {
  const p = b.palette;
  const { lines, size } = titleLines(b.title);
  const titleId = `banner-title-${b.expansionId}`;
  const style = { "--b1": p.b1, "--b2": p.b2, "--b3": p.b3, "--glow": p.glow, "--glow2": p.glow2, "--slab": p.slab, "--ang": b.layout.flip ? "65deg" : "115deg", "--gx": b.layout.flip ? "28%" : "72%", "--gx2": b.layout.flip ? "12%" : "88%" } as CSSProperties;
  const prod = productsHref ?? `/sellados?expansion=${b.expansionId}`;
  const gal = galleryHref ?? `/expansiones/${b.slug}#exp-cartas`;
  const flip = b.layout.flip;
  // Si una imagen no se puede descargar: el arte principal conserva su recuadro (fondo del banner) con el mismo texto alternativo; la caja y el sobre, que son adornos con posición absoluta, dejan solo su texto alternativo.
  const img = (i: typeof b.art | undefined, props: { className: string; sizes: string; style?: CSSProperties }, principal = false) => i && loadImages
    ? <SafeImage src={i.src} alt={i.alt} width={i.width} height={i.height} priority={priority} sizes={props.sizes} className={props.className} style={props.style} fallback={principal ? <div role="img" aria-label={i.alt} className={props.className} /> : <span className="sr-only">{i.alt}</span>} />
    : null;
  // La caja se dimensiona por su forma: las cajas altas (p. ej. MEGA Dream ex) ocupan menos ancho para no tapar el arte.
  const boxWidth = b.box ? `${Math.round(Math.min(37, Math.max(22, (b.box.width / b.box.height) * 24)))}%` : undefined;
  return (
    <section className={`hero-cut relative isolate overflow-hidden text-paper ${className}`} style={style} aria-labelledby={titleId} data-testid={`banner-${b.expansionId}`}>
      <div className="hero-bg absolute inset-0 -z-30" aria-hidden="true" />
      <div className="hero-slab absolute inset-0 -z-20" aria-hidden="true" />
      <svg className="absolute inset-0 -z-10 h-full w-full" viewBox="0 0 1440 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
        <g transform={`rotate(${-6 + b.layout.tilt * 3} 720 280)`} fill="none" stroke={p.bolt} strokeOpacity=".13" strokeWidth="1.4" fontFamily="var(--font-anton), Impact, sans-serif" fontSize="170" letterSpacing="4">
          <text x="-60" y="150">{`${b.ghost} ${b.ghost}`}</text>
          <text x="-260" y="330">{`${b.ghost} ${b.ghost}`}</text>
          <text x="-120" y="510">{`${b.ghost} ${b.ghost}`}</text>
        </g>
        <g transform={flip ? "translate(1440 0) scale(-1 1)" : undefined}>
          <polygon points="1120,0 1050,170 1100,170 1000,380 1190,150 1130,150 1210,0" fill={p.bolt} fillOpacity=".5" />
          <polygon points="1330,60 1290,190 1325,190 1260,330 1385,170 1350,170 1400,60" fill={p.bolt} fillOpacity=".32" />
          <polygon points="760,0 730,90 752,90 700,200 800,80 776,80 820,0" fill={p.bolt2} fillOpacity=".28" />
          <polygon points="1420,330 1370,450 1405,450 1340,560 1440,420 1410,420 1440,330" fill={p.bolt} fillOpacity=".4" />
        </g>
      </svg>

      <div className={`mx-auto grid max-w-[1440px] gap-2 px-4 pt-3 sm:gap-3 sm:px-8 sm:pt-4 lg:items-center lg:gap-6 lg:pt-8 ${bottomSpace ? "pb-[3.75rem] sm:pb-24 lg:pb-24" : "pb-10 sm:pb-14 lg:pb-16"} ${flip ? "lg:grid-cols-[minmax(0,1.18fr)_minmax(0,.82fr)]" : "lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]"}`}>
        <div className={`order-2 ${flip ? "lg:order-2" : "lg:order-1"}`}>
          <p className="eyebrow kicker text-gold">Pokémon TCG · {b.code}<span className="max-sm:hidden"> · Edición japonesa</span></p>
          <H id={titleId} className={`display mt-2 sm:mt-3 [text-shadow:0_3px_0_rgba(0,0,0,.4)] ${size}`}>{lines.map((l, i) => <span key={i} className="block">{l}</span>)}</H>
          <p className="mt-1.5 text-[.9375rem] font-semibold text-gold sm:mt-3 sm:text-xl">{b.hero}</p>
          <p className="mt-1.5 max-w-md text-[.8125rem] leading-snug text-paper/90 max-sm:line-clamp-2 sm:mt-3 sm:text-base sm:leading-relaxed">{b.tagline}</p>
          {meta}
          <div className="mt-3 flex gap-2 sm:mt-6 sm:flex-wrap sm:gap-3">
            <Link href={prod} className="btn-cut btn-cut-gold max-sm:flex-1 max-sm:!px-3">Ver productos <ArrowIcon /></Link>
            <Link href={gal} className="btn-cut btn-cut-line max-sm:flex-1 max-sm:!px-3"><span>Galería<span className="sr-only sm:not-sr-only"> de cartas</span></span> <ArrowIcon /></Link>
          </div>
        </div>

        <div className={`order-1 ${flip ? "lg:order-1" : "lg:order-2"}`} data-testid="banner-arte">
          <div className="hero-glow relative mx-auto w-full max-w-[640px] pb-4 max-sm:max-w-[80%] sm:pb-8">
            <div className={`hero-panel relative w-[88%] p-[3px] ${flip ? "hero-panel-flip mr-[6%] ml-auto" : "ml-[6%]"}`}>
              <div className={`hero-panel-in relative overflow-hidden bg-ink ${flip ? "hero-panel-flip" : ""}`} style={{ aspectRatio: `${b.art.width} / ${b.art.height}` }}>
                {img(b.art, { className: "h-full w-full object-cover", sizes: "(min-width:1024px) 560px, 90vw" }, true)}
                <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(3,8,12,.45),transparent_35%)]" aria-hidden="true" />
              </div>
            </div>
            {b.booster && img(b.booster, { className: `absolute -bottom-1 w-[19%] ${b.booster.opaque ? "rounded-[3px] ring-1 ring-gold/70 " : ""}drop-shadow-[0_10px_16px_rgba(0,0,0,.55)] ${flip ? "right-0 rotate-[8deg] sm:right-[1%]" : "left-0 -rotate-[8deg] sm:left-[1%]"}`, sizes: "(min-width:1024px) 130px, 22vw" })}
            {b.box && img(b.box, { style: { width: boxWidth }, className: `absolute -bottom-2 ${b.box.opaque ? "rounded-[3px] ring-1 ring-gold/70 " : ""}drop-shadow-[0_12px_18px_rgba(0,0,0,.55)] ${flip ? "left-0 -rotate-[3deg]" : "right-0 rotate-[3deg]"}`, sizes: "(min-width:1024px) 230px, 38vw" })}
          </div>
        </div>
      </div>
    </section>
  );
}
