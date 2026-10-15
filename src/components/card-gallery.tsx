"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CardArt } from "./art";

export type CardView = {
  id: string; name: string; number: string; rarity?: string; variant?: string;
  src: string; alt: string; available: boolean; isDemo: boolean;
};
export type CardGroup = {
  expansionId: string; name: string; slug: string;
  status: "complete" | "partial" | "unavailable";
  officialUrl?: string; officialPublisher?: string; isDemo: boolean; note?: string; cards: CardView[];
};

const PAGE = 12;
const toneFor = (rarity?: string) => ({ "Común": "mint", "Poco común": "paper", "Rara": "gold", "Ultra rara": "violet" } as Record<string, string>)[rarity ?? ""] ?? "ink";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** `sizes` real de cada uso: la imagen de origen mide 360 px, así que nunca se pide más (antes se pedía la versión de 1200 px para una carta de ~180 px). */
const GRID_SIZES = "(min-width:1280px) 190px, (min-width:1024px) 22vw, (min-width:640px) 30vw, 46vw";

function CardFace({ c, className = "", sizes = GRID_SIZES }: { c: CardView; className?: string; sizes?: string }) {
  return c.available ? (
    <Image src={c.src} alt={c.alt} width={360} height={504} sizes={sizes} loading="lazy" fetchPriority="low" className={className} />
  ) : (
    <CardArt tone={toneFor(c.rarity)} label={c.name.toUpperCase().slice(0, 18)} className={className} />
  );
}

/**
 * Carta de la grilla: la imagen se pide recién cuando la carta está por entrar en pantalla (a 300 px). El `loading="lazy"` del navegador en conexiones
 * lentas adelanta miles de píxeles y esas cartas, que están muy abajo, le sacaban ancho de banda a la foto principal de la ficha (medido: LCP de ~6 s en 3G).
 * El hueco conserva la proporción de la carta, así que no hay saltos de diseño.
 */
function GridCard({ c }: { c: CardView }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ aspectRatio: "360 / 504" }}>{near ? <CardFace c={c} className="h-auto w-full" /> : null}</div>;
}

/** Galería de cartas: búsqueda por nombre/número, filtro por rareza, carga progresiva, zoom, estado de datos por expansión. */
export function CardGallery({ groups }: { groups: CardGroup[] }) {
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState("");
  const [shown, setShown] = useState<Record<string, number>>({});
  const [zoomed, setZoomed] = useState<CardView | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const rarities = useMemo(() => [...new Set(groups.flatMap((g) => g.cards.map((c) => c.rarity).filter(Boolean) as string[]))], [groups]);
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const matches = (c: CardView) => (!rarity || c.rarity === rarity) && terms.every((t) => norm(`${c.name} ${c.number}`).includes(t));
  const loaded = groups.reduce((n, g) => n + g.cards.length, 0);
  const found = groups.reduce((n, g) => n + g.cards.filter(matches).length, 0);
  const anyCards = loaded > 0;

  return (
    <div>
      {anyCards && (
        <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <div>
            <label htmlFor="cg-q" className="mb-1 block text-[.68rem] font-bold uppercase tracking-[.14em] text-ink/70">Buscar carta (nombre o número)</label>
            <input id="cg-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShown({}); }} className="h-12 w-full border border-ink/40 bg-white px-3 text-sm" placeholder="Ej.: 007 o nombre" />
          </div>
          <div>
            <label htmlFor="cg-r" className="mb-1 block text-[.68rem] font-bold uppercase tracking-[.14em] text-ink/70">Rareza</label>
            <select id="cg-r" value={rarity} onChange={(e) => { setRarity(e.target.value); setShown({}); }} className="h-12 w-full border border-ink/40 bg-white px-3 text-sm">
              <option value="">Todas</option>
              {rarities.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </form>
      )}
      {anyCards && (
        <p className="mt-4 text-sm text-ink/70" role="status" aria-live="polite">
          {found === 0 ? "Ninguna carta coincide con la búsqueda." : `${found} carta${found === 1 ? "" : "s"} encontrada${found === 1 ? "" : "s"} de ${loaded} cargada${loaded === 1 ? "" : "s"}.`}
        </p>
      )}

      {groups.map((g) => {
        const list = g.cards.filter(matches);
        const limit = shown[g.expansionId] ?? PAGE;
        return (
          <div key={g.expansionId} className="mt-6">
            {groups.length > 1 && <h3 className="display text-3xl normal-case">{g.name}</h3>}
            <StatusBanner g={g} />
            {g.cards.length > 0 && (
              <>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {list.slice(0, limit).map((c) => (
                    <li key={c.id}>
                      <button type="button" onClick={() => { setZoomed(c); dialog.current?.showModal(); }} aria-haspopup="dialog" aria-label={`Ampliar ${c.name}, número ${c.number}${c.rarity ? `, ${c.rarity}` : ""}`} className="group block w-full text-left">
                        <div className="overflow-hidden bg-ink/5 p-1 transition group-hover:bg-gold/40">
                          <GridCard c={c} />
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-tight">{c.name}</p>
                        <p className="text-xs text-ink/65">N.º {c.number}{c.rarity ? ` · ${c.rarity}` : ""}{c.variant ? ` · ${c.variant}` : ""}</p>
                      </button>
                    </li>
                  ))}
                </ul>
                {list.length > limit && (
                  <button type="button" onClick={() => setShown((s) => ({ ...s, [g.expansionId]: limit + PAGE }))} className="mt-4 min-h-12 border border-ink px-6 text-sm font-bold hover:bg-gold">
                    Ver más cartas ({list.length - limit} restantes)
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}

      <dialog ref={dialog} aria-label="Carta ampliada" onClose={() => setZoomed(null)} onClick={(e) => { if (e.target === dialog.current) dialog.current?.close(); }} className="m-auto max-h-[94dvh] w-[min(92vw,460px)] overflow-y-auto border-2 border-ink bg-paper p-0 backdrop:bg-ink/80">
        {zoomed && (
          <div>
            <div className="flex items-center justify-between border-b border-ink/20 px-4 py-2">
              <p className="text-sm font-semibold">{zoomed.name} · N.º {zoomed.number}</p>
              <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar carta ampliada" className="flex h-11 w-11 items-center justify-center border border-ink text-xl">×</button>
            </div>
            <div className="p-4"><CardFace c={zoomed} sizes="(min-width:640px) 360px, 90vw" className="mx-auto h-auto w-full max-w-[360px]" /></div>
            <p className="px-4 pb-4 text-xs text-ink/65">{zoomed.rarity ?? "Rareza no informada"}{zoomed.isDemo ? " · Carta ilustrativa de demostración" : ""}</p>
          </div>
        )}
      </dialog>
    </div>
  );
}

function StatusBanner({ g }: { g: CardGroup }) {
  const link = g.officialUrl && (
    <a href={g.officialUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-emerald">
      Ver fuente oficial{g.officialPublisher ? ` (${g.officialPublisher})` : ""} ↗
    </a>
  );
  if (g.status === "complete") {
    return <div className="mt-2 border border-emerald/40 bg-emerald/10 px-3 py-2 text-sm"><p><b>Lista completa:</b> {g.cards.length} cartas cargadas.{g.isDemo ? " (Datos ficticios de demostración.)" : ""}</p>{g.note && <p className="mt-1 text-xs text-ink/75">{g.note}</p>}</div>;
  }
  if (g.status === "partial") {
    return <p className="mt-2 border border-vermilion/50 bg-vermilion/10 px-3 py-2 text-sm"><b>Galería parcial:</b> mostramos solo las {g.cards.length} cartas cargadas; no es la lista completa. {link}{g.note && <span className="mt-1 block text-xs text-ink/75">{g.note}</span>}</p>;
  }
  return <p className="mt-2 border border-ink/30 bg-white/60 px-3 py-3 text-sm"><b>Lista de cartas no disponible todavía.</b> {g.note ?? "Todavía no verificamos la lista de esta expansión."} {link}</p>;
}
